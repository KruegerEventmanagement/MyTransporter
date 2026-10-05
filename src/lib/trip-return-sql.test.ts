// Echte SQL-Prüfung des Rückgabe-/Schutz-Codes in einer In-Memory-Postgres (PGlite).
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const SQL = readFileSync(new URL("../test/sql/trip-return.sql", import.meta.url), "utf8");
const B = "11111111-2222-3333-4444-555555555555";
const U1 = "aaaaaaaa-0000-0000-0000-000000000001";
const U2 = "aaaaaaaa-0000-0000-0000-000000000002";
const ADMIN = "aaaaaaaa-0000-0000-0000-0000000000ad";
const ALL = ["post_front", "post_front_right", "post_right", "post_back_right", "post_back", "post_back_left", "post_left", "post_front_left", "post_interior", "post_odometer", "post_fuel", "tank_receipt"];

let db: PGlite;

const STUB = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE storage.objects (bucket_id text, name text, metadata jsonb);
CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TABLE public.user_roles (user_id uuid, role app_role);
CREATE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY, user_id uuid NOT NULL, status text NOT NULL, plan_id text NOT NULL, plan_label text DEFAULT 'x',
  vehicle_name text DEFAULT 'v', vehicle_plate text DEFAULT 'LEO MY 101', pickup_code text DEFAULT '1234',
  start_date date DEFAULT '2026-10-05', start_hour int DEFAULT 10, start_km int, end_km int,
  free_km int NOT NULL DEFAULT 0, km_price_cents int NOT NULL DEFAULT 45, extra_km int, extra_km_charge_cents int,
  return_code text, coupon_code text, discount_cents int NOT NULL DEFAULT 0, tank_level_end text,
  ai_end_fuel_percent int, end_km_manual boolean, return_reported_at timestamptz, return_review_reason text,
  return_exceptions jsonb, return_reminder_10min_for timestamptz, reminder_24h_sent_at timestamptz,
  reminder_30min_sent_at timestamptz, remarks text);
CREATE TABLE public.trip_photos (booking_id uuid, photo_url text, photo_type text);
CREATE TABLE public.admin_notifications (type text, title text, body text, booking_id uuid, user_id uuid);
`;

async function as(uid: string | null) {
  await db.query(`SELECT set_config('test.uid', $1, false)`, [uid ?? ""]);
}
async function seed(o: Record<string, unknown> = {}) {
  const row = { id: B, user_id: U1, status: "active", plan_id: "24h_300", start_km: 1000, free_km: 200, km_price_cents: 45, ...o };
  const cols = Object.keys(row);
  await db.query(`INSERT INTO public.bookings (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
}
async function photo(tag: string, opts: { path?: string; object?: boolean; size?: number; mime?: string } = {}) {
  const path = opts.path ?? `${B}/${tag}_x.jpg`;
  await db.query(`INSERT INTO public.trip_photos VALUES ($1,$2,$3)`, [B, path, tag]);
  if (opts.object !== false)
    await db.query(`INSERT INTO storage.objects VALUES ('trip-photos',$1,$2)`, [path, JSON.stringify({ size: opts.size ?? 1200, mimetype: opts.mime ?? "image/jpeg" })]);
}
async function report(endKm: number, ex: Record<string, string> = {}, fuel: number | null = 70) {
  const r = await db.query<{ r: Record<string, unknown> }>(`SELECT public.report_trip_return($1,$2,true,$3,$4::jsonb) AS r`, [B, endKm, fuel, JSON.stringify(ex)]);
  return r.rows[0]!.r;
}
const booking = async () => (await db.query<Record<string, unknown>>(`SELECT * FROM public.bookings WHERE id=$1`, [B])).rows[0]!;
const notifications = async () => (await db.query(`SELECT * FROM public.admin_notifications`)).rows.length;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(SQL);
  await db.query(`INSERT INTO public.user_roles VALUES ($1,'admin')`, [ADMIN]);
});

describe("report_trip_return (SQL)", () => {
  it("berechnet Mehrkilometer aus Snapshots, setzt returning, genau eine Admin-Meldung", async () => {
    await as(null);
    await seed();
    for (const t of ALL) await photo(t);
    await as(U1);
    const r = await report(1250);
    expect(r).toMatchObject({ ok: true, alreadyReported: false, extraKm: 50, chargeCents: 2250 });
    expect(String(r.returnCode)).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const b = await booking();
    expect(b).toMatchObject({ status: "returning", end_km: 1250, extra_km: 50, extra_km_charge_cents: 2250, ai_end_fuel_percent: 70 });
    expect(await notifications()).toBe(1);
    // Doppelklick / verlorene Antwort / Reload: derselbe Code, keine Nebenaktion
    const again = await report(9999);
    expect(again).toMatchObject({ ok: true, alreadyReported: true, returnCode: r.returnCode });
    expect((await booking()).end_km).toBe(1250);
    expect(await notifications()).toBe(1);
  });
  it("Fremdkonto, cancelled, paid, nicht angemeldet: keine Rückgabe", async () => {
    await as(null);
    await seed();
    for (const t of ALL) await photo(t);
    await as(U2);
    expect(await report(1100)).toMatchObject({ ok: false, error: "Buchung nicht gefunden." });
    await as(null);
    expect(await report(1100)).toMatchObject({ ok: false });
    await db.query(`UPDATE public.bookings SET status='cancelled'`);
    await as(U1);
    expect(await report(1100)).toMatchObject({ ok: false });
    await as(null);
    await db.query(`UPDATE public.bookings SET status='paid'`);
    await as(U1);
    expect(await report(1100)).toMatchObject({ ok: false });
    expect(await notifications()).toBe(0);
  });
  it("Aliase started/picked_up gelten als aktiv; return_pending mit Code wird wiederverwendet", async () => {
    await as(null);
    await seed({ status: "picked_up" });
    for (const t of ALL) await photo(t);
    await as(U1);
    expect(await report(1000)).toMatchObject({ ok: true, extraKm: 0, chargeCents: 0 });
    await as(null);
    await db.query(`UPDATE public.bookings SET status='return_pending', return_code='OLD777'`);
    await as(U1);
    expect(await report(1)).toMatchObject({ ok: true, alreadyReported: true, returnCode: "OLD777" });
  });
  it("Fotozeilen ohne echtes Objekt, fremder Ordner, leer, kein Bild oder Traversal zählen nicht", async () => {
    await as(null);
    await seed();
    for (const t of ALL.slice(4)) await photo(t);
    await photo("post_front", { object: false });
    await photo("post_front_right", { path: `99999999-2222-3333-4444-555555555555/a.jpg` });
    await photo("post_right", { size: 0 });
    await photo("post_back_right", { mime: "text/html" });
    await photo("post_back_right", { path: `${B}/../x.jpg` });
    await db.query(`INSERT INTO public.trip_photos VALUES ($1,'https://evil.example/a.jpg','post_front')`, [B]);
    await as(U1);
    const r = await report(1100);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["post_front", "post_front_right", "post_right", "post_back_right"]);
    expect((await booking()).status).toBe("active");
  });
  it("begründete Ausnahmen + Tachoproblem 399999 → Prüfung, keine Berechnung; zu kurze Gründe zählen nicht", async () => {
    await as(null);
    await seed({ start_km: 399999 });
    for (const t of ALL.filter((t) => t !== "tank_receipt" && t !== "post_fuel")) await photo(t);
    await as(U1);
    expect((await report(120, { receipt: "kurz", fuel: "kurz" })).missing).toEqual(["post_fuel", "tank_receipt"]);
    const r = await report(120, { receipt: "Beleg an der Kasse verloren", fuel: "Anzeige ist dunkel geblieben" });
    expect(r).toMatchObject({ ok: true, extraKm: null, chargeCents: null });
    const b = await booking();
    expect(b.extra_km_charge_cents).toBeNull();
    expect(String(b.return_review_reason)).toMatch(/kleiner als Start 399999.*Tankstand-Foto fehlt.*Tankbeleg fehlt/);
    expect(b.return_exceptions).toEqual({ fuel: "Anzeige ist dunkel geblieben", receipt: "Beleg an der Kasse verloren" });
  });
  it("Endstand 0 bei Start 0 zulässig; km-Tarif berechnet alle km", async () => {
    await as(null);
    await seed({ plan_id: "km", start_km: 0, km_price_cents: 90 });
    for (const t of ALL) await photo(t);
    await as(U1);
    expect(await report(0)).toMatchObject({ ok: true, extraKm: 0, chargeCents: 0 });
  });
});

describe("bookings_guard_customer_update (SQL)", () => {
  const upd = (set: string) => db.query(`UPDATE public.bookings SET ${set} WHERE id='${B}'`);
  it("Kunde kann Status, Preis, Zeitraum, Code nicht direkt manipulieren", async () => {
    await as(null);
    await seed({ extra_km: 10, extra_km_charge_cents: 450, return_code: "OLD123", return_review_reason: "init", return_reminder_10min_for: null });
    await as(U1);
    for (const set of [
      "status='completed'",
      "status='returning'",
      `user_id='${U2}'`,
      "extra_km=0",
      "extra_km_charge_cents=0",
      "plan_id='week_x9'",
      "plan_price=1",
      "deposit=0",
      "free_km=99999",
      "km_price_cents=0",
      "stripe_payment_intent_id='fake'",
      "addons_total_cents=1",
      "start_date='2027-01-01'",
      "start_hour=8",
      "return_code='HACK22'",
      "start_km=5",
      "return_review_reason=NULL",
      "return_reminder_10min_for=now()",
    ]) {
      await expect(upd(set), set).rejects.toThrow(/TRIP_(FIELD|STATUS)_LOCKED/);
    }
    expect((await booking()).status).toBe("active");
  });
  it("legitimer Abholpfad: paid → active mit start_km, Bemerkung", async () => {
    await as(null);
    await seed({ status: "paid", start_km: null });
    await as(U1);
    await upd("start_km=1000, remarks='Kratzer', status='active'");
    expect(await booking()).toMatchObject({ status: "active", start_km: 1000 });
    await expect(upd("status='paid'")).rejects.toThrow();
  });
  it("Rückgabe-Entwurf während Fahrt erlaubt, nach Meldung gesperrt", async () => {
    await as(null);
    await seed();
    await as(U1);
    await upd("end_km=1200, end_km_manual=true, ai_end_fuel_percent=50");
    await as(null);
    await upd("status='returning'");
    await as(U1);
    await expect(upd("end_km=1")).rejects.toThrow(/LOCKED/);
  });
  it("Admin und Service-Rolle (Cron/Webhook) bleiben unbeschränkt", async () => {
    await as(null);
    await seed();
    await upd("return_reminder_10min_for=now()");
    await as(ADMIN);
    await upd("status='completed', extra_km=3");
    expect(await booking()).toMatchObject({ status: "completed", extra_km: 3 });
  });
});
