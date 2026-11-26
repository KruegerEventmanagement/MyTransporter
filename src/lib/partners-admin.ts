/** Admin-Logik für Partner & QR-Codes (RLS als Admin + explizite Rollenprüfung). */
import { computePartnerCommission, isPartnerSlug, safeTargetPath, type CommissionRefund } from "@/lib/partner-tracking";

export type AdminDb = { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any };
type Ctx = { supabase: AdminDb; userId: string };

export async function assertPartnerAdmin(ctx: Ctx) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error || data !== true) throw new Error("Nicht autorisiert");
}

export type PartnerInput = { id?: string | null; slug: string; name: string; commissionPercent: number; targetPath: string; active: boolean; notes?: string | null };

export function validatePartnerInput(d: unknown): PartnerInput {
  const x = (d ?? {}) as Record<string, unknown>;
  const slug = String(x["slug"] ?? "").trim().toLowerCase();
  if (!isPartnerSlug(slug)) throw new Error("Kurzname: nur a–z, 0–9 und Bindestrich (max. 60).");
  const name = String(x["name"] ?? "").trim();
  if (!name || name.length > 120) throw new Error("Name fehlt oder ist zu lang.");
  const pct = Number(x["commissionPercent"]);
  if (!Number.isFinite(pct) || pct < 0 || pct > 50) throw new Error("Provision muss zwischen 0 und 50 % liegen.");
  const targetPath = String(x["targetPath"] ?? "/").trim() || "/";
  if (safeTargetPath(targetPath) !== targetPath) throw new Error("Zielseite muss ein interner Pfad sein, z. B. / oder /preise.");
  const notes = x["notes"] == null ? null : String(x["notes"]).slice(0, 1000);
  const id = typeof x["id"] === "string" && x["id"] ? String(x["id"]) : null;
  return { id, slug, name, commissionPercent: pct, targetPath, active: x["active"] !== false, notes };
}

export async function savePartner(ctx: Ctx, input: PartnerInput) {
  await assertPartnerAdmin(ctx);
  const row = {
    slug: input.slug,
    name: input.name,
    commission_rate_bp: Math.round(input.commissionPercent * 100),
    target_path: input.targetPath,
    active: input.active,
    notes: input.notes ?? null,
  };
  const q = input.id
    ? ctx.supabase.from("partners").update(row).eq("id", input.id).select("id").single()
    : ctx.supabase.from("partners").insert(row).select("id").single();
  const { data, error } = await q;
  if (error) throw new Error(error.code === "23505" ? "Dieser Kurzname ist schon vergeben." : "Speichern fehlgeschlagen.");
  return { id: data.id as string };
}

export type StatsRange = { from: string | null; to: string | null };
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export function validateRange(d: unknown): StatsRange {
  const x = (d ?? {}) as Record<string, unknown>;
  const f = typeof x["from"] === "string" && ISO_DAY.test(x["from"]) ? x["from"] : null;
  const t = typeof x["to"] === "string" && ISO_DAY.test(x["to"]) ? x["to"] : null;
  return { from: f, to: t };
}
// Zeitraum in Europe/Berlin-Tagen, als einfache Annäherung über UTC-Grenzen ±0.
const startIso = (day: string) => new Date(`${day}T00:00:00+01:00`).toISOString();
const endIso = (day: string) => new Date(new Date(`${day}T00:00:00+01:00`).getTime() + 86_400_000).toISOString();

export type PartnerBookingRow = {
  bookingId: string; reference: string; attributedAt: string; startDate: string; vehicle: string; status: string;
  rentCents: number; refundedCents: number; baseCents: number; ratePercent: number; commissionCents: number; eligible: boolean;
};

export async function partnerStats(ctx: Ctx, range: StatsRange) {
  await assertPartnerAdmin(ctx);
  const db = ctx.supabase;
  const { data: partners, error } = await db.from("partners").select("id, slug, name, commission_rate_bp, target_path, active, notes, created_at").order("created_at", { ascending: true });
  if (error) throw new Error("Partner konnten nicht geladen werden.");

  let aq = db.from("booking_partner_attributions").select("booking_id, partner_id, commission_rate_bp, attributed_at");
  if (range.from) aq = aq.gte("attributed_at", startIso(range.from));
  if (range.to) aq = aq.lt("attributed_at", endIso(range.to));
  const { data: attrs, error: aErr } = await aq.limit(5000);
  if (aErr) throw new Error("Zuordnungen konnten nicht geladen werden.");
  const ids = (attrs ?? []).map((a: any) => a.booking_id as string);

  const bookings = new Map<string, any>();
  const refunds = new Map<string, CommissionRefund[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: bs, error: bErr } = await db.from("bookings").select("id, pickup_code, start_date, vehicle_plate, status, plan_price, addons_total_cents").in("id", chunk);
    if (bErr) throw new Error("Buchungen konnten nicht geladen werden.");
    for (const b of bs ?? []) bookings.set(b.id, b);
    const { data: rs, error: rErr } = await db.from("stripe_refunds").select("refund_id, booking_id, amount_cents, status, allocation").in("booking_id", chunk);
    if (rErr) throw new Error("Erstattungen konnten nicht geladen werden.");
    for (const r of rs ?? []) { const l = refunds.get(r.booking_id) ?? []; l.push(r); refunds.set(r.booking_id, l); }
  }

  const out = [];
  for (const p of partners ?? []) {
    let vq = db.from("partner_visits").select("id", { count: "exact", head: true }).eq("partner_id", p.id);
    if (range.from) vq = vq.gte("visited_at", startIso(range.from));
    if (range.to) vq = vq.lt("visited_at", endIso(range.to));
    const { count } = await vq;
    const rows: PartnerBookingRow[] = [];
    for (const a of (attrs ?? []).filter((x: any) => x.partner_id === p.id)) {
      const b = bookings.get(a.booking_id);
      if (!b) continue;
      const c = computePartnerCommission(b, refunds.get(b.id) ?? [], a.commission_rate_bp);
      rows.push({
        bookingId: b.id, reference: b.pickup_code, attributedAt: a.attributed_at, startDate: b.start_date, vehicle: b.vehicle_plate,
        status: b.status, rentCents: c.rentCents, refundedCents: c.refundedCents, baseCents: c.baseCents,
        ratePercent: a.commission_rate_bp / 100, commissionCents: c.commissionCents, eligible: c.eligible,
      });
    }
    rows.sort((x, y) => y.attributedAt.localeCompare(x.attributedAt));
    out.push({
      id: p.id as string, slug: p.slug as string, name: p.name as string, ratePercent: p.commission_rate_bp / 100,
      targetPath: p.target_path as string, active: p.active as boolean, notes: (p.notes as string | null) ?? null,
      visits: count ?? 0, bookings: rows.length, paidBookings: rows.filter((r) => r.eligible).length,
      baseCents: rows.reduce((s, r) => s + r.baseCents, 0), commissionCents: rows.reduce((s, r) => s + r.commissionCents, 0), rows,
    });
  }
  return out;
}
export type PartnerStats = Awaited<ReturnType<typeof partnerStats>>[number];
