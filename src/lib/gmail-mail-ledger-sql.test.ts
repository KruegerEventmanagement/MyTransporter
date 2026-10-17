import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
const SQL = readFileSync(new URL('../../drizzle/migrations/0010_gmail_mail_attempt_ledger.sql', import.meta.url), 'utf8');
let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.customer_mail_outbox(id uuid PRIMARY KEY); CREATE TABLE public.manual_reservation_customer_mails(id uuid PRIMARY KEY);`);
  await db.exec(SQL);
});
afterEach(async () => { await db.close(); });
async function claim(key='key', hash='hash') {
  const { rows } = await db.query<{r: {result: string; lease_token?: string; provider_id?: string}}>('select public.claim_gmail_attempt($1,$2) as r', [key,hash]);
  const r = rows[0]?.r; if (!r) throw new Error('missing result'); return r;
}
describe('Gmail ledger actual migration', () => {
  it('parallel claims give only one send lease', async () => {
    const results = await Promise.all([claim(),claim()]);
    expect(results.map(r=>r.result).sort()).toEqual(['claimed','in_progress']);
  });
  it('expired lease after crash never permits a second send', async () => {
    expect((await claim()).result).toBe('claimed');
    await db.exec("update public.mail_provider_attempts set lease_until=now()-interval '1 second'");
    expect((await claim()).result).toBe('needs_review');
    expect((await claim()).result).toBe('needs_review');
  });
  it('accepted message reads same id; stale completion rejected', async () => {
    const r = await claim();
    const bad = await db.query<{ok:boolean}>("select public.complete_gmail_attempt('key',gen_random_uuid(),'18abcdef12345678') as ok");
    expect(bad.rows[0]?.ok).toBe(false);
    await db.query("select public.complete_gmail_attempt('key',$1::uuid,'18abcdef12345678')", [r.lease_token]);
    expect(await claim()).toMatchObject({ result:'sent',provider_id:'18abcdef12345678' });
    expect((await claim('key','changed-payload')).result).toBe('needs_review');
  });
  it('definite rejection permits controlled retry after backoff only', async () => {
    const r = await claim();
    await db.query("select public.fail_gmail_attempt('key',$1::uuid,429,'transient',false)", [r.lease_token]);
    expect((await claim()).result).toBe('backoff');
    await db.exec("update public.mail_provider_attempts set next_attempt_at=now()-interval '1 second'");
    expect((await claim()).result).toBe('claimed');
  });
  it('5xx unknown outcome remains blocked despite elapsed time', async () => {
    const r=await claim(); await db.query("select public.fail_gmail_attempt('key',$1::uuid,503,'transient',true)", [r.lease_token]);
    expect((await claim()).result).toBe('needs_review');
  });
  it('provider binding cannot change on outer mail rows', async () => {
    await db.exec("insert into public.customer_mail_outbox(id) values(gen_random_uuid())");
    await expect(db.exec("update public.customer_mail_outbox set mail_provider='gmail'")).rejects.toThrow('mail provider is immutable');
  });
});
