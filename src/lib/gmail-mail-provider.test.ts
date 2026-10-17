import { describe, it, expect, vi } from 'vitest';
import { sendGmailWithDeps, type GmailDeps } from './gmail-mail-provider.server';
import type { MailSendArgs } from './mail-provider';
const args: MailSendArgs = { from: 'Christian Krüger – MyTransporter <info@mytransporter.org>', to: 'customer@example.org', subject: 'Bestätigung', html: 'Hallo', idempotencyKey: 'booking-1' };
function harness(res: Response | Error, overrides: Partial<GmailDeps> = {}) {
  const f = vi.fn(async (url: RequestInfo | URL) => {
    if (String(url).includes('/profile')) return new Response('{"emailAddress":"info@mytransporter.org"}');
    if (res instanceof Error) throw res;
    return res;
  });
  const deps: GmailDeps = { enabled: true, gatewayKey: 'mock', connectionKey: 'mock', fetch: f,
    claim: vi.fn(async () => ({ result: 'claimed', lease_token: 'lease' })),
    complete: vi.fn(async () => true), fail: vi.fn(async () => true), ...overrides };
  return { deps, f };
}
describe('Gmail durable adapter', () => {
  it('acceptance requires real Gmail id; no Resend request', async () => {
    const { deps, f } = harness(new Response('{"id":"18abcdef12345678"}'));
    expect(await sendGmailWithDeps(args, deps)).toEqual({ ok: true, providerId: '18abcdef12345678' });
    expect(deps.complete).toHaveBeenCalledWith('booking-1', 'lease', '18abcdef12345678');
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[1]?.[0])).toContain('connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send');
  });
  it('wrong account prevents claim and sending', async () => {
    const { deps } = harness(new Response('{}'), { fetch: vi.fn(async () => new Response('{"emailAddress":"info@bringcar.de"}')) });
    expect(await sendGmailWithDeps(args, deps)).toMatchObject({ ok: false, ambiguous: false });
    expect(deps.claim).not.toHaveBeenCalled();
  });
  it.each(['needs_review','in_progress','backoff'])('blocks %s without sending', async result => {
    const { deps, f } = harness(new Response('{}'), { claim: async () => ({ result }) });
    expect(await sendGmailWithDeps(args, deps)).toMatchObject({ ok: false });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('known acceptance reads back rather than sending twice', async () => {
    const { deps, f } = harness(new Response('{}'), { claim: async () => ({ result: 'sent', provider_id: '18abcdef12345678' }) });
    expect(await sendGmailWithDeps(args, deps)).toEqual({ ok: true, providerId: '18abcdef12345678' });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it.each([401,403,429,500,503,408,409])('status %s: persists only status/kind, not sensitive response', async status => {
    const { deps } = harness(new Response('recipient customer@example.org SECRET', { status }));
    const r = await sendGmailWithDeps(args, deps);
    const ambiguous = status >= 500 || status === 408 || status === 409;
    expect(r).toMatchObject({ ok: false, status, ambiguous });
    expect(JSON.stringify(r)).not.toContain('SECRET');
    expect(deps.fail).toHaveBeenCalledWith('booking-1', 'lease', status, status === 429 || status >= 500 ? 'transient' : 'other', ambiguous);
  });
  it('network loss after claim is permanently ambiguous', async () => {
    const { deps } = harness(new Error('unknown'));
    expect(await sendGmailWithDeps(args, deps)).toMatchObject({ ok: false, ambiguous: true });
    expect(deps.fail).toHaveBeenCalledWith('booking-1','lease',null,'network',true);
  });
  it('2xx missing id is unknown, never success', async () => {
    const { deps } = harness(new Response('{"id":""}'));
    expect(await sendGmailWithDeps(args, deps)).toMatchObject({ ok: false, kind: 'no_provider_id', ambiguous: true });
    expect(deps.complete).not.toHaveBeenCalled();
  });
  it('completion crash preserves unknown acceptance for manual reconciliation', async () => {
    const { deps } = harness(new Response('{"id":"18abcdef12345678"}'), { complete: async () => { throw new Error('DB'); } });
    expect(await sendGmailWithDeps(args, deps)).toMatchObject({ ok: false, ambiguous: true });
  });
});
