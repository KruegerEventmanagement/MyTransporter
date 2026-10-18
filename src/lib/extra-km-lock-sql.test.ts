// Gegenseitige Sperre Mehrkilometer: Karteneinzug vs. Kautionsverrechnung (echte SQL der Migration in PGlite).
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIG = readFileSync(new URL("../../drizzle/migrations/0013_extra_km_mutual_lock.sql", import.meta.url), "utf8");
const B = "11111111-2222-3333-4444-555555555555";
const R = "22222222-2222-3333-4444-555555555555";
const STUB = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.bookings (id uuid PRIMARY KEY, status text, extra_charge_status text, extra_charge_cents int, extra_charge_intent_id text, extra_km_charge_cents int);
CREATE TABLE public.deposit_settlements (booking_id uuid, kind text, status text);
CREATE TABLE public.deposit_reviews (id uuid PRIMARY KEY, source_type text, source_id uuid, status text DEFAULT 'draft', revision int DEFAULT 1,
  items jsonb DEFAULT '[]', finalized_at timestamptz, finalized_by uuid, updated_by uuid, final_deposit_cents int, final_deduct_total_cents int,
  final_deduct_applied_cents int, final_outstanding_cents int, final_refund_cents int, manual_payout_status text);
`;
let db: PGlite;
const claim = async (amt = 2250) => (await db.query<{ r: { result: string; amount_cents?: number } }>(`SELECT public.claim_extra_charge($1,$2) r`, [B, amt])).rows[0]!.r;
const fin = async (km: number, applied = 2250) =>
  (await db.query<{ r: { result: string } }>(`SELECT public.finalize_deposit_review($1,1,$2,20000,$3,$3,0,$4,$5) r`, [R, B, applied, 20000 - applied, km])).rows[0]!.r;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(MIG);
  await db.query(`INSERT INTO public.bookings (id, status, extra_km_charge_cents) VALUES ($1,'completed',2250)`, [B]);
});

describe("Mehrkilometer: nur ein Zahlungs-/Verrechnungspfad", () => {
  it("Kautionsentwurf mit extra_km sperrt separaten Einzug (keine Statusänderung)", async () => {
    await db.query(`INSERT INTO public.deposit_reviews (id, source_type, source_id, items) VALUES ($1,'booking',$2,'[{"type":"extra_km","amount_cents":2250}]')`, [R, B]);
    expect((await claim()).result).toBe("in_deposit_review");
    expect((await db.query<{ s: string | null }>(`SELECT extra_charge_status s FROM public.bookings`)).rows[0]!.s).toBeNull();
  });
  it("laufender Einzug sperrt Abschluss mit extra_km; Doppelklick = resume mit eingefrorenem Betrag", async () => {
    expect(await claim()).toMatchObject({ result: "claimed", amount_cents: 2250 });
    expect(await claim()).toMatchObject({ result: "resume", amount_cents: 2250 });
    await db.query(`INSERT INTO public.deposit_reviews (id, source_type, source_id, items) VALUES ($1,'booking',$2,'[{"type":"extra_km","amount_cents":2250}]')`, [R, B]);
    expect((await fin(2250)).result).toBe("extra_charged");
  });
  it("erfolgreicher oder unklarer alter Einzug sperrt; abgelehnter erlaubt Verrechnung", async () => {
    await db.query(`UPDATE public.bookings SET extra_charge_status='succeeded'`);
    expect((await claim()).result).toBe("succeeded");
    await db.query(`UPDATE public.bookings SET extra_charge_status='processing', extra_charge_claimed_at = now() - interval '2 days'`);
    expect((await claim()).result).toBe("needs_review");
    await db.query(`UPDATE public.bookings SET extra_charge_status='failed'`);
    await db.query(`INSERT INTO public.deposit_reviews (id, source_type, source_id, items) VALUES ($1,'booking',$2,'[{"type":"extra_km","amount_cents":2250}]')`, [R, B]);
    expect((await fin(2250)).result).toBe("finalized");
    expect((await db.query<{ c: number }>(`SELECT final_extra_km_applied_cents c FROM public.deposit_reviews`)).rows[0]!.c).toBe(2250);
  });
  it("frei gewählter Betrag ungleich Forderung wird abgelehnt", async () => {
    expect((await claim(9999)).result).toBe("amount_mismatch");
  });
  it("Zuordnung größer als verrechnet wird abgelehnt", async () => {
    await db.query(`INSERT INTO public.deposit_reviews (id, source_type, source_id, items) VALUES ($1,'booking',$2,'[{"type":"extra_km","amount_cents":2250}]')`, [R, B]);
    await expect(fin(3000, 2250)).rejects.toThrow(/INCONSISTENT/);
  });
});
