// Abschluss mit freiem Rückzahlungsbetrag + atomarer Erinnerungs-Claim (echte SQL der Migrationen in PGlite).
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const M12 = readFileSync(new URL("../../drizzle/migrations/0012_deposit_reviews.sql", import.meta.url), "utf8");
const M13 = readFileSync(new URL("../../drizzle/migrations/0013_extra_km_mutual_lock.sql", import.meta.url), "utf8");
const M14 = readFileSync(new URL("../../drizzle/migrations/0014_deposit_reminders_and_refund_override.sql", import.meta.url), "utf8");
const M15 = readFileSync(new URL("../../drizzle/migrations/0015_deposit_adjustment_and_reminder_claim.sql", import.meta.url), "utf8");
const B = "11111111-2222-3333-4444-555555555555";
const R = "22222222-2222-3333-4444-555555555555";
const M = "33333333-2222-3333-4444-555555555555";
const ADMIN = "44444444-2222-3333-4444-555555555555";
const STUB = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.has_role(uuid, text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE public.bookings (id uuid PRIMARY KEY, status text, deposit numeric, deposit_status text,
  return_reported_at timestamptz, start_date date, start_hour int, plan_id text, extra_charge_status text,
  extra_charge_cents int, extra_charge_intent_id text, extra_km_charge_cents int, extra_charge_claimed_at timestamptz);
CREATE TABLE public.manual_reservations (id uuid PRIMARY KEY, end_at timestamptz);
CREATE TABLE public.deposit_settlements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, kind text, status text);
CREATE TABLE public.admin_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text, title text, body text, booking_id uuid, read boolean DEFAULT false);
CREATE TABLE public.customer_mail_settings (id boolean PRIMARY KEY);
INSERT INTO public.customer_mail_settings (id) VALUES (true);
CREATE FUNCTION public.local_start_at(d date, h int) RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$ SELECT (d + make_interval(hours => h))::timestamptz $$;
CREATE FUNCTION public.plan_end_at(s timestamptz, p text) RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$ SELECT s + interval '3 hours' $$;
`;
let db: PGlite;
const END = "2026-10-20T10:00:00Z"; // local_start 07:00 + 3h
const fin = (total: number, applied: number, outstanding: number, refund: number, km = 0) =>
  db.query<{ r: { result: string } }>(`SELECT public.finalize_deposit_review($1,1,$2,$3,$4,$5,$6,$7,$8) r`, [R, ADMIN, 20000, total, applied, outstanding, refund, km]).then((x) => x.rows[0]!.r);
const claim = (src: string, id: string, version: string) =>
  db.query<{ r: { result: string } }>(`SELECT public.claim_deposit_reminder($1,$2,$3,'Name','Text [kaution:' || $1 || ':' || $2 || ']') r`, [src, id, version]).then((x) => x.rows[0]!.r);

beforeEach(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(M12);
  await db.exec(M13);
  await db.exec(M14);
  await db.exec(M15);
  await db.query(`INSERT INTO public.bookings (id, status, deposit, deposit_status, start_date, start_hour, plan_id) VALUES ($1,'completed',200,'held','2026-10-20',7,'3h')`, [B]);
  await db.query(`INSERT INTO public.manual_reservations (id, end_at) VALUES ($1,$2)`, [M, END]);
  await db.query(`INSERT INTO public.deposit_reviews (id, source_type, source_id, items, refund_override_cents, adjustment_reason, send_closing_mail) VALUES ($1,'booking',$2,'[]',15000,'Kulanz',false)`, [R, B]);
});

describe("Abschluss mit freiem Rückzahlungsbetrag (konsistente Rechnung)", () => {
  it("Kulanz: 200 € Kaution, 100 € Gründe, 150 € Rückzahlung ist abschließbar", async () => {
    expect((await fin(10000, 5000, 0, 15000)).result).toBe("finalized");
    const r = (await db.query(`SELECT final_deduct_total_cents t, final_deduct_applied_cents a, final_refund_cents r, final_outstanding_cents o FROM public.deposit_reviews`)).rows[0] as any;
    expect(r).toMatchObject({ t: 10000, a: 5000, r: 15000, o: 0 });
  });
  it("Zusatzabzug: 200 € Kaution, 100 € Gründe, 70 € Rückzahlung ist abschließbar", async () => {
    await db.query(`UPDATE public.deposit_reviews SET refund_override_cents = 7000, adjustment_reason = 'Zusatzreinigung'`);
    expect((await fin(10000, 13000, 0, 7000)).result).toBe("finalized");
  });
  it("Restforderung über der Kaution bleibt bestehen", async () => {
    await db.query(`UPDATE public.deposit_reviews SET refund_override_cents = NULL, adjustment_reason = NULL`);
    expect((await fin(25000, 20000, 5000, 0)).result).toBe("finalized");
  });
  it("inkonsistente Summen werden weiter abgelehnt", async () => {
    await expect(fin(10000, 4000, 0, 15000)).rejects.toThrow(/INCONSISTENT/); // applied ≠ deposit - refund
    await expect(fin(10000, 5000, 1000, 15000)).rejects.toThrow(/INCONSISTENT/); // falscher Rest
    await expect(fin(10000, 5000, 0, 21000)).rejects.toThrow(/INCONSISTENT/); // refund > deposit
  });
  it("Betrag, Begründung und Mailwahl sind nach Abschluss eingefroren", async () => {
    await fin(10000, 5000, 0, 15000);
    await expect(db.query(`UPDATE public.deposit_reviews SET refund_override_cents = 1`)).rejects.toThrow(/FINALIZED/);
    await expect(db.query(`UPDATE public.deposit_reviews SET adjustment_reason = 'x'`)).rejects.toThrow(/FINALIZED/);
    await expect(db.query(`UPDATE public.deposit_reviews SET send_closing_mail = true`)).rejects.toThrow(/FINALIZED/);
  });
});

describe("Atomarer Erinnerungs-Claim", () => {
  it("erzeugt Dedupe + In-App-Aufgabe genau einmal je Version", async () => {
    expect((await claim("booking", B, END)).result).toBe("created");
    expect((await claim("booking", B, END)).result).toBe("exists");
    const n = (await db.query(`SELECT count(*)::int c, bool_and(read) r FROM public.admin_notifications`)).rows[0] as any;
    expect(n).toMatchObject({ c: 1, r: false });
  });
  it("geändertes Mietende (spätere Rückgabe) ist eine neue Version und markiert die alte Aufgabe erledigt", async () => {
    expect((await claim("booking", B, END)).result).toBe("created");
    const later = "2026-10-21T10:00:00Z";
    expect((await claim("booking", B, later)).result).toBe("stale"); // DB rechnet noch mit altem Ende
    await db.query(`UPDATE public.bookings SET return_reported_at = $1`, [later]);
    expect((await claim("booking", B, later)).result).toBe("created");
    const n = (await db.query(`SELECT count(*)::int c, count(*) FILTER (WHERE read)::int r FROM public.admin_notifications`)).rows[0] as any;
    expect(n).toMatchObject({ c: 2, r: 1 });
  });
  it("Storno, 0-€-Kaution, freigegebene Kaution und Abschluss erzeugen nichts", async () => {
    await db.query(`UPDATE public.bookings SET status = 'cancelled'`);
    expect((await claim("booking", B, END)).result).toBe("cancelled");
    await db.query(`UPDATE public.bookings SET status = 'completed', deposit = 0`);
    expect((await claim("booking", B, END)).result).toBe("no_deposit");
    await db.query(`UPDATE public.bookings SET deposit = 200, deposit_status = 'released'`);
    expect((await claim("booking", B, END)).result).toBe("no_deposit");
    await db.query(`UPDATE public.bookings SET deposit_status = 'held'`);
    await db.query(`UPDATE public.deposit_reviews SET status = 'finalized'`);
    expect((await claim("booking", B, END)).result).toBe("done");
    expect(((await db.query(`SELECT count(*)::int c FROM public.admin_notifications`)).rows[0] as any).c).toBe(0);
  });
  it("manueller Termin: Aufgabe ohne Buchungsbezug", async () => {
    expect((await claim("manual", M, END)).result).toBe("created");
    const n = (await db.query(`SELECT booking_id b FROM public.admin_notifications`)).rows[0] as any;
    expect(n.b).toBeNull();
  });
});
