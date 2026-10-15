// Echte SQL-Prüfung der Kunden-Mail-Outbox (Claim/Fencing/Eindeutigkeit) aus den
// produktiven Migrationsdateien, isoliert in PGlite – keine Produktionsdaten.
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const M3 = readFileSync(new URL("../../drizzle/migrations/0003_customer_mail_outbox.sql", import.meta.url), "utf8");
const M4 = readFileSync(new URL("../../drizzle/migrations/0004_customer_mail_outbox_reminders_queue.sql", import.meta.url), "utf8");

const STUB = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA cron; CREATE SCHEMA private; CREATE SCHEMA net;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE cron.job (jobname text, schedule text, command text);
CREATE FUNCTION cron.schedule(n text, s text, c text) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO cron.job VALUES (n,s,c); SELECT 1::bigint $$;
CREATE FUNCTION cron.unschedule(n text) RETURNS boolean LANGUAGE sql AS $$ DELETE FROM cron.job WHERE jobname = n; SELECT true $$;
CREATE TABLE private.app_config (key text PRIMARY KEY, value text);
CREATE TABLE net.calls (url text);
CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.calls VALUES (url); SELECT 1::bigint $$;
CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TABLE public.user_roles (user_id uuid, role app_role);
CREATE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TABLE public.bookings (id uuid PRIMARY KEY, status text, created_at timestamptz DEFAULT now(),
  reminder_24h_sent_at timestamptz, reminder_30min_sent_at timestamptz);
CREATE TABLE public.manual_reservations (id uuid PRIMARY KEY, created_at timestamptz DEFAULT now(),
  reminder_24h_sent_at timestamptz, reminder_30min_sent_at timestamptz);
CREATE TABLE public.manual_reservation_customer_mails (reservation_id uuid, status text, created_at timestamptz DEFAULT now());
`;

let db: PGlite;
const P = JSON.stringify({ from: "a", to: "b@c.de", reply_to: "a", subject: "s", html: "h", text: "t" });

async function row(o: Record<string, unknown> = {}): Promise<string> {
  const r = {
    source_type: "booking", source_id: crypto.randomUUID(), kind: "invoice", due_at: new Date(Date.now() - 1000).toISOString(),
    recipient_email: "b@c.de", payload: P, ...o,
  };
  r["idempotency_key" as never] = (o.idempotency_key as never) ?? (`k-${r.source_id}-${r.kind}` as never);
  const cols = Object.keys(r);
  const res = await db.query<{ id: string }>(
    `INSERT INTO public.customer_mail_outbox (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`,
    Object.values(r),
  );
  return res.rows[0]!.id;
}
const claim = async (id: string, safe = 82800) =>
  (await db.query<{ r: Record<string, unknown> }>(`SELECT public.claim_customer_mail($1, 90, $2) AS r`, [id, safe])).rows[0]!.r;
const get = async (id: string) => (await db.query<Record<string, unknown>>(`SELECT * FROM public.customer_mail_outbox WHERE id=$1`, [id])).rows[0]!;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(M3);
  await db.exec(M4);
});

describe("customer_mail_outbox (SQL aus Migration)", () => {
  it("genau ein Eintrag je Quelle+Art (doppelte Events)", async () => {
    const sid = crypto.randomUUID();
    await row({ source_id: sid });
    await expect(row({ source_id: sid, idempotency_key: "anders" })).rejects.toThrow();
  });

  it("zweiter paralleler Claim bekommt in_progress; Fencing schützt Abschluss", async () => {
    const id = await row();
    const a = await claim(id);
    expect(a.result).toBe("claimed");
    expect((await claim(id)).result).toBe("in_progress");
    const stale = (await db.query<{ ok: boolean }>(`SELECT public.complete_customer_mail($1, gen_random_uuid(), 're_1') AS ok`, [id])).rows[0]!.ok;
    expect(stale).toBe(false);
    const ok = (await db.query<{ ok: boolean }>(`SELECT public.complete_customer_mail($1, $2::uuid, 're_1') AS ok`, [id, a.lease_token])).rows[0]!.ok;
    expect(ok).toBe(true);
    expect((await claim(id)).result).toBe("sent");
    await expect(db.query(`UPDATE public.customer_mail_outbox SET status='failed' WHERE id=$1`, [id])).rejects.toThrow(/final/);
  });

  it("leere Provider-ID schließt nicht ab", async () => {
    const id = await row();
    const a = await claim(id);
    const ok = (await db.query<{ ok: boolean }>(`SELECT public.complete_customer_mail($1, $2::uuid, '  ') AS ok`, [id, a.lease_token])).rows[0]!.ok;
    expect(ok).toBe(false);
  });

  it("nicht fällig (24h-Bewertung) wird nie vorzeitig beansprucht", async () => {
    const id = await row({ kind: "review_request", due_at: new Date(Date.now() + 3600_000).toISOString() });
    expect((await claim(id)).result).toBe("not_due");
  });

  it("unklarer Versuch nach Idempotenzfenster ⇒ needs_review statt Blindversand", async () => {
    const id = await row();
    await claim(id);
    await db.query(`UPDATE public.customer_mail_outbox SET lease_until = now() - interval '1 min', first_attempt_at = now() - interval '24 hours' WHERE id=$1`, [id]);
    expect((await claim(id)).result).toBe("needs_review");
    expect((await get(id)).status).toBe("needs_review");
  });

  it("abgelaufene Lease innerhalb des Fensters: erneuter Claim mit prior_ambiguous", async () => {
    const id = await row();
    await claim(id);
    await db.query(`UPDATE public.customer_mail_outbox SET lease_until = now() - interval '1 min' WHERE id=$1`, [id]);
    const c = await claim(id);
    expect(c).toMatchObject({ result: "claimed", prior_ambiguous: true });
  });

  it("Backoff wird respektiert; Payload ist unveränderlich", async () => {
    const id = await row();
    const a = await claim(id);
    await db.query(`SELECT public.fail_customer_mail($1, $2::uuid, 'invalid_key', '401', false, 3600)`, [id, a.lease_token]);
    expect((await claim(id)).result).toBe("backoff");
    await expect(db.query(`UPDATE public.customer_mail_outbox SET payload='{}'::jsonb WHERE id=$1`, [id])).rejects.toThrow(/immutable/);
  });

  it("abgelaufene Erinnerung wird nicht mehr gesendet", async () => {
    const id = await row({ kind: "reminder_30min", expires_at: new Date(Date.now() - 1000).toISOString() });
    expect((await claim(id)).result).toBe("expired");
    expect((await get(id)).status).toBe("cancelled");
  });

  it("Due-Queue: 25 Backoffs/aktive Leases blockieren später fällige Zeilen nicht", async () => {
    for (let i = 0; i < 25; i++) {
      await row({ status: "failed", next_attempt_at: new Date(Date.now() + 3600_000).toISOString(), due_at: new Date(Date.now() - 7200_000).toISOString() });
    }
    const late = await row({ due_at: new Date(Date.now() - 60_000).toISOString() });
    const ids = (await db.query<{ id: string }>(`SELECT public.customer_mail_due_ids(25) AS id`)).rows.map((r) => r.id);
    expect(ids).toEqual([late]);
  });

  it("Anti-Join findet auch Buchung Nr. 201+ ohne Eintrag", async () => {
    const from = new Date(Date.now() - 86400_000).toISOString();
    for (let i = 0; i < 205; i++) {
      const id = crypto.randomUUID();
      await db.query(`INSERT INTO public.bookings (id, status, created_at) VALUES ($1,'paid', now() - ($2 || ' seconds')::interval)`, [id, String(300 - i)]);
      if (i < 200) await row({ source_id: id, kind: "review_request" });
    }
    const missing = (await db.query<{ id: string }>(`SELECT id FROM public.customer_mail_missing_bookings('review_request', $1, 50)`, [from])).rows;
    expect(missing.length).toBe(5);
  });

  it("Admin-Freigabe nur für Admins", async () => {
    const id = await row({ status: "needs_review" });
    await db.query(`SELECT set_config('test.uid', $1, false)`, [crypto.randomUUID()]);
    await expect(db.query(`SELECT public.release_customer_mail_for_retry($1)`, [id])).rejects.toThrow(/forbidden/);
  });

  it("Stündlicher Job ruft nichts auf, solange nicht aktiviert", async () => {
    await db.query(`INSERT INTO private.app_config VALUES ('notify_hook_token','t'),('notify_hook_url','https://x/api/public/hooks/a')`);
    await db.query(`SELECT private.run_customer_mail_hook()`);
    expect((await db.query(`SELECT * FROM net.calls`)).rows.length).toBe(0);
    await db.query(`INSERT INTO private.app_config VALUES ('customer_mail_hook_enabled','true')`);
    await db.query(`SELECT private.run_customer_mail_hook()`);
    expect((await db.query<{ url: string }>(`SELECT url FROM net.calls`)).rows[0]!.url).toBe("https://x/api/public/hooks/process-customer-mails");
    expect((await db.query<{ schedule: string }>(`SELECT schedule FROM cron.job WHERE jobname='mt-process-customer-mails'`)).rows[0]!.schedule).toBe("7 * * * *");
  });
});
