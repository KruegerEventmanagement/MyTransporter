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
    name: input.name,
    commission_rate_bp: Math.round(input.commissionPercent * 100),
    target_path: input.targetPath,
    active: input.active,
    notes: input.notes ?? null,
  };
  // Kurzname bleibt nach Anlage fest (gedruckte QR-Codes); Update ändert ihn nie.
  const q = input.id
    ? ctx.supabase.from("partners").update(row).eq("id", input.id).select("id").single()
    : ctx.supabase.from("partners").insert({ ...row, slug: input.slug }).select("id").single();
  const { data, error } = await q;
  if (error) throw new Error(error.code === "23505" ? "Dieser Kurzname ist schon vergeben." : "Speichern fehlgeschlagen.");
  return { id: data.id as string };
}

export type StatsRange = { from: string | null; to: string | null };
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
function parseDay(v: unknown): string | null {
  if (v == null || v === "") return null;
  const m = typeof v === "string" ? ISO_DAY.exec(v) : null;
  if (!m) throw new Error("Ungültiges Datum.");
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  if (d.getUTCFullYear() !== +m[1]! || d.getUTCMonth() !== +m[2]! - 1 || d.getUTCDate() !== +m[3]!) throw new Error("Ungültiges Datum.");
  return v as string;
}
export function validateRange(d: unknown): StatsRange {
  const x = (d ?? {}) as Record<string, unknown>;
  const from = parseDay(x["from"]);
  const to = parseDay(x["to"]);
  if (from && to && from > to) throw new Error("„Von“ darf nicht nach „Bis“ liegen.");
  return { from, to };
}

const BERLIN = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
function berlinOffsetMs(utcMs: number): number {
  const p = Object.fromEntries(BERLIN.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p["year"]!, +p["month"]! - 1, +p["day"]!, +p["hour"]!, +p["minute"]!, +p["second"]!);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}
/** UTC-Zeitpunkt von 00:00 Europe/Berlin am Tag (Sommer-/Winterzeit korrekt). */
export function berlinDayStartIso(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - berlinOffsetMs(guess);
  t = guess - berlinOffsetMs(t);
  return new Date(t).toISOString();
}
/** Exklusives Ende: 00:00 Berlin am Folgetag (23-/25-Stunden-Tage korrekt). */
export function berlinDayEndIso(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return berlinDayStartIso(next);
}

const PAGE = 1000;
/** Liest alle Zeilen seitenweise (stabile Sortierung kommt vom Aufrufer). */
export async function fetchAllPages<T>(build: () => any, what: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(`${what} konnten nicht geladen werden.`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export type PartnerBookingRow = {
  bookingId: string; reference: string; attributedAt: string; startDate: string; vehicle: string; status: string;
  rentCents: number; refundedCents: number; baseCents: number; ratePercent: number; commissionCents: number; eligible: boolean;
};

export async function partnerStats(ctx: Ctx, range: StatsRange) {
  await assertPartnerAdmin(ctx);
  const db = ctx.supabase;
  const fromIso = range.from ? berlinDayStartIso(range.from) : null;
  const toIso = range.to ? berlinDayEndIso(range.to) : null;

  const partners = await fetchAllPages<any>(
    () => db.from("partners").select("id, slug, name, commission_rate_bp, target_path, active, notes, created_at").order("created_at", { ascending: true }).order("id", { ascending: true }),
    "Partner",
  );
  const attrs = await fetchAllPages<any>(() => {
    let q = db.from("booking_partner_attributions").select("booking_id, partner_id, commission_rate_bp, attributed_at");
    if (fromIso) q = q.gte("attributed_at", fromIso);
    if (toIso) q = q.lt("attributed_at", toIso);
    return q.order("booking_id", { ascending: true });
  }, "Zuordnungen");
  const ids = attrs.map((a) => a.booking_id as string);

  const bookings = new Map<string, any>();
  const refunds = new Map<string, CommissionRefund[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const bs = await fetchAllPages<any>(() => db.from("bookings").select("id, pickup_code, start_date, vehicle_plate, status, plan_price, addons_total_cents").in("id", chunk).order("id", { ascending: true }), "Buchungen");
    for (const b of bs) bookings.set(b.id, b);
    const rs = await fetchAllPages<any>(() => db.from("stripe_refunds").select("refund_id, booking_id, amount_cents, status, allocation").in("booking_id", chunk).order("refund_id", { ascending: true }), "Erstattungen");
    for (const r of rs) { const l = refunds.get(r.booking_id) ?? []; l.push(r); refunds.set(r.booking_id, l); }
  }

  const out = [];
  for (const p of partners) {
    let vq = db.from("partner_visits").select("id", { count: "exact", head: true }).eq("partner_id", p.id);
    if (fromIso) vq = vq.gte("visited_at", fromIso);
    if (toIso) vq = vq.lt("visited_at", toIso);
    const { count, error: vErr } = await vq;
    if (vErr || typeof count !== "number") throw new Error("QR-Aufrufe konnten nicht gezählt werden.");
    let sq = db.from("partner_signups").select("user_id", { count: "exact", head: true }).eq("partner_id", p.id);
    if (fromIso) sq = sq.gte("attributed_at", fromIso);
    if (toIso) sq = sq.lt("attributed_at", toIso);
    const { count: signups, error: sErr } = await sq;
    if (sErr || typeof signups !== "number") throw new Error("Registrierungen konnten nicht gezählt werden.");
    const notes = await fetchAllPages<{ id: string; kind: string; status: string }>(() => {
      let q = db.from("partner_notifications").select("id, kind, status").eq("partner_id", p.id).neq("kind", "test");
      if (fromIso) q = q.gte("created_at", fromIso);
      if (toIso) q = q.lt("created_at", toIso);
      return q.order("id", { ascending: true });
    }, "Benachrichtigungen");
    const scanMails = notes.filter((n) => n.kind === "scan").length;
    const notify = {
      scanMails, scanWithoutMail: Math.max(0, count - scanMails),
      sent: notes.filter((n) => n.status === "sent").length,
      open: notes.filter((n) => n.status === "pending" || n.status === "sending" || n.status === "failed").length,
      review: notes.filter((n) => n.status === "needs_review").length,
    };
    const rows: PartnerBookingRow[] = [];
    for (const a of attrs.filter((x) => x.partner_id === p.id)) {
      const b = bookings.get(a.booking_id);
      if (!b) throw new Error("Zugeordnete Buchung fehlt – Statistik unvollständig.");
      const c = computePartnerCommission(b, refunds.get(b.id) ?? [], a.commission_rate_bp);
      rows.push({
        bookingId: b.id, reference: b.pickup_code, attributedAt: a.attributed_at, startDate: b.start_date, vehicle: b.vehicle_plate,
        status: b.status, rentCents: c.rentCents, refundedCents: c.refundedCents, baseCents: c.baseCents,
        ratePercent: a.commission_rate_bp / 100, commissionCents: c.commissionCents, eligible: c.eligible,
      });
    }
    rows.sort((x, y) => y.attributedAt.localeCompare(x.attributedAt) || x.bookingId.localeCompare(y.bookingId));
    out.push({
      id: p.id as string, slug: p.slug as string, name: p.name as string, ratePercent: p.commission_rate_bp / 100,
      targetPath: p.target_path as string, active: p.active as boolean, notes: (p.notes as string | null) ?? null,
      visits: count, signups, notify, bookings: rows.length, paidBookings: rows.filter((r) => r.eligible).length,
      baseCents: rows.reduce((s, r) => s + r.baseCents, 0), commissionCents: rows.reduce((s, r) => s + r.commissionCents, 0), rows,
    });
  }
  return out;
}
export type PartnerStats = Awaited<ReturnType<typeof partnerStats>>[number];
