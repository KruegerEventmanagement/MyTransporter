/**
 * Kautionsabschluss (Server): Entwurf, bewusster Abschluss, Stripe nur über
 * deposit-settlement.server.ts (eingefrorener Auftrag, stabiler Key, Buchungslock),
 * manuelle Rückzahlung mit separater Bestätigung, Mails nur über die Outbox.
 * Mails und Geld sind unabhängig: Mail-Retry ruft nie Stripe.
 */
import {
  priceItems, computeTotals, photoChecklist, buildAdminReviewMail, buildDigestMail, buildCustomerClosingMail,
  digestSourceId, berlinDateAndHour, DIGEST_HOUR_BERLIN, documentationFeeAllowed, eur, ADMIN_RECIPIENT, MAX_MESSAGE,
  bookingDepositState, closingMailStillValid, adminMailStillValid, safePhotoRows,
  type PricedItem, type ReviewFacts, type Totals, type PayoutState, type DigestEntry
} from "@/lib/deposit-review";
import { resolveTripWindow } from "@/lib/trip-time";
import { requiredReturnTagsV2 } from "@/lib/trip-return";
import type { OutboxRow } from "@/lib/customer-mail-outbox";

type Db = { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => any };
async function db(): Promise<Db> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as Db;
}
function must(res: { data: any; error: { message: string } | null }, what: string): any {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export type Source = "booking" | "manual";

export type ReviewRow = {
  id: string; source_type: Source; source_id: string; status: "draft" | "finalized"; revision: number;
  items: unknown; customer_message: string | null;
  manual_deposit_cents: number | null; manual_deposit_method: string | null;
  final_deposit_cents: number | null; final_deduct_total_cents: number | null; final_deduct_applied_cents: number | null;
  final_outstanding_cents: number | null; final_refund_cents: number | null; settlement_id: string | null;
  finalized_at: string | null; manual_payout_status: string | null; manual_payout_method: string | null; manual_payout_confirmed_at: string | null;
};

export type DepositContext = {
  source: Source; id: string; customerName: string; firstName: string | null; email: string | null; userId: string | null;
  bookingRef: string; vehicle: string; startMs: number; endMs: number; returnReportedMs: number | null;
  priceLine: string; status: string;
  /** null ⇒ Kaution nicht erfasst (manuell). */
  depositCents: number | null; depositLine: string;
  stripe: { paymentIntentId: string | null; environment: string | null } | null;
  depositStatus: string | null;
  facts: ReviewFacts;
  checklist: { tag: string; label: string; present: boolean }[] | null;
  photos: { photo_type: string; photo_url: string }[];
  issues: string[];
  docFee: { allowed: boolean; why: string };
  extraKm: { km: number | null; cents: number | null; alreadyPaid: boolean };
  review: ReviewRow | null;
  settlements: { id: string; kind: string; status: string; refund_cents: number; failure_reason: string | null; refund_id: string | null }[];
  closingMail: { status: string; provider_message_id: string | null; blocked_reason: string | null } | null;
  knownBounce: boolean;
};

const shortRef = (id: string) => id.slice(0, 8).toUpperCase();

export async function loadDepositContext(source: Source, id: string): Promise<DepositContext> {
  const d = await db();
  const review = must(await d.from("deposit_reviews").select("*").eq("source_type", source).eq("source_id", id).maybeSingle(), "Prüfung") as ReviewRow | null;
  const closing = must(await d.from("customer_mail_outbox").select("status, provider_message_id, blocked_reason").eq("source_type", source).eq("source_id", id).eq("kind", "deposit_closing").maybeSingle(), "Mail");
  if (source === "booking") {
    const b = must(await d.from("bookings").select("id, user_id, status, vehicle_name, vehicle_plate, plan_id, plan_label, plan_price, deposit, deposit_status, start_date, start_hour, return_reported_at, return_exceptions, extra_km, extra_km_charge_cents, extra_charge_status, stripe_payment_intent_id, stripe_environment").eq("id", id).maybeSingle(), "Buchung");
    if (!b) throw new Error("Buchung nicht gefunden");
    const p = must(await d.from("profiles").select("first_name, last_name, email").eq("id", b.user_id).maybeSingle(), "Profil");
    const { startMs, endMs } = resolveTripWindow(b);
    const present = (must(await d.rpc("trip_confirmed_photo_types", { _booking_id: id }), "Fotos") ?? []) as string[];
    const photos = must(await d.from("trip_photos").select("photo_type, photo_url").eq("booking_id", id).order("created_at"), "Fotos") as { photo_type: string; photo_url: string }[];
    const checklist = photoChecklist(present);
    const safePhotos = safePhotoRows(id, photos, present);
    const required = requiredReturnTagsV2();
    const missing = required.filter((t) => !checklist.find((c) => c.tag === t)?.present);
    const exceptions = (b.return_exceptions && typeof b.return_exceptions === "object" ? b.return_exceptions : {}) as Record<string, string>;
    const facts: ReviewFacts = {
      extraKmChargeCents: b.extra_km_charge_cents ?? null, extraKmAlreadyPaid: b.extra_charge_status === "succeeded", extraKm: b.extra_km ?? null,
      missingTags: missing, exceptions,
    };
    const issues: string[] = [];
    if (!b.return_reported_at) issues.push("Rückgabe im System noch nicht bestätigt");
    if (missing.length) issues.push(`Fehlende Nachweise: ${checklist.filter((c) => !c.present).map((c) => c.label).join(", ")}`);
    for (const [k, v] of Object.entries(exceptions)) if (v) issues.push(`Kundenhinweis (${k}): ${String(v).slice(0, 200)}`);
    if (b.extra_km_charge_cents) issues.push(`Mehrkilometer laut Snapshot: ${eur(b.extra_km_charge_cents)}${b.extra_charge_status === "succeeded" ? " (bereits separat bezahlt)" : ""}`);
    const settlements = must(await d.from("deposit_settlements").select("id, kind, status, refund_cents, failure_reason, refund_id").eq("booking_id", id).order("created_at"), "Erstattungen");
    const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Unbekannt";
    const depositCents = Math.round(Number(b.deposit ?? 0) * 100);
    const email = p?.email ?? null;
    return {
      source, id, customerName: name, firstName: p?.first_name ?? null, email, userId: b.user_id,
      bookingRef: `MT-${shortRef(id)}`, vehicle: `${b.vehicle_name} · ${b.vehicle_plate}`, startMs, endMs,
      returnReportedMs: b.return_reported_at ? Date.parse(b.return_reported_at) : null,
      priceLine: `${eur(Math.round(Number(b.plan_price) * 100))} (${b.plan_label}) · ${b.stripe_payment_intent_id ? "online bezahlt" : "Zahlung nicht verknüpft"}`,
      status: b.status, depositCents, depositLine: `${eur(depositCents)} · Status ${b.deposit_status}`,
      stripe: { paymentIntentId: b.stripe_payment_intent_id, environment: b.stripe_environment }, depositStatus: b.deposit_status,
      facts, checklist, photos: safePhotos, issues, docFee: documentationFeeAllowed(facts),
      extraKm: { km: b.extra_km ?? null, cents: b.extra_km_charge_cents ?? null, alreadyPaid: b.extra_charge_status === "succeeded" },
      review, settlements, closingMail: closing, knownBounce: email ? await hasPermanentBounce(email) : false,
    };
  }
  const m = must(await d.from("manual_reservations").select("id, customer_name, customer_email, vehicle_name, vehicle_plate, start_at, end_at, total_price_cents").eq("id", id).maybeSingle(), "Termin");
  if (!m) throw new Error("Termin nicht gefunden");
  const depositCents = review?.manual_deposit_cents ?? null;
  const facts: ReviewFacts = { extraKmChargeCents: null, extraKmAlreadyPaid: false, extraKm: null, missingTags: [], exceptions: {} };
  const email = m.customer_email ?? null;
  return {
    source, id, customerName: m.customer_name, firstName: String(m.customer_name).split(/[ ,]/)[0] || null, email, userId: null,
    bookingRef: `Termin ${shortRef(id)}`, vehicle: `${m.vehicle_name ?? "Fahrzeug"} · ${m.vehicle_plate}`,
    startMs: Date.parse(m.start_at), endMs: Date.parse(m.end_at), returnReportedMs: null,
    priceLine: m.total_price_cents != null ? `${eur(m.total_price_cents)} · Zahlung manuell` : "nicht erfasst",
    status: "manual", depositCents,
    depositLine: depositCents == null ? "nicht erfasst" : `${eur(depositCents)} (${review?.manual_deposit_method ?? "?"})`,
    stripe: null, depositStatus: null, facts, checklist: null, photos: [],
    issues: depositCents == null ? ["Kaution im System nicht erfasst: tatsächlich erhaltenen Betrag eintragen"] : [],
    docFee: { allowed: false, why: "Manueller Termin ohne Rückgabefotos im System" },
    extraKm: { km: null, cents: null, alreadyPaid: false },
    review, settlements: [], closingMail: closing, knownBounce: email ? await hasPermanentBounce(email) : false,
  };
}

async function hasPermanentBounce(email: string): Promise<boolean> {
  const d = await db();
  const rows = must(await d.from("customer_mail_outbox").select("id").ilike("recipient_email", email.trim()).eq("error_kind", "permanent_bounce").limit(1), "Bounce");
  return (rows ?? []).length > 0;
}

/** Offene Kautionen: Ende erreicht und kein finaler Abschluss, oder Abschluss mit offener Auszahlung. */
export async function listOpenDeposits() {
  const d = await db();
  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10);
  const bookings = must(await d.from("bookings").select("id, user_id, status, vehicle_name, vehicle_plate, plan_id, start_date, start_hour, deposit, deposit_status, return_reported_at").in("status", ["paid", "active", "in_progress", "picked_up", "returning", "return_pending", "completed"]).gte("start_date", since).limit(500), "Buchungen") as any[];
  const manual = must(await d.from("manual_reservations").select("id, customer_name, vehicle_name, vehicle_plate, start_at, end_at").lte("end_at", nowIso).gte("end_at", `${since}T00:00:00Z`).limit(300), "Termine") as any[];
  const reviews = must(await d.from("deposit_reviews").select("source_type, source_id, status, manual_payout_status, settlement_id"), "Prüfungen") as any[];
  const settl = must(await d.from("deposit_settlements").select("id, booking_id, status, kind"), "Erstattungen") as any[];
  const revMap = new Map(reviews.map((r) => [`${r.source_type}:${r.source_id}`, r]));
  const ids = [...new Set(bookings.map((b) => b.user_id))];
  const profiles = ids.length ? (must(await d.from("profiles").select("id, first_name, last_name").in("id", ids), "Profile") as any[]) : [];
  const pName = new Map(profiles.map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unbekannt"]));
  const out: { source: Source; id: string; name: string; vehicle: string; endMs: number; state: string; returned: boolean }[] = [];
  for (const b of bookings) {
    const { endMs } = resolveTripWindow(b);
    if (!(b.return_reported_at || endMs <= Date.now())) continue;
    const r = revMap.get(`booking:${b.id}`);
    const state = bookingDepositState(r ?? null, settl.filter((x) => x.booking_id === b.id), b.deposit_status);
    if (state) out.push({ source: "booking", id: b.id, name: pName.get(b.user_id) ?? "Unbekannt", vehicle: `${b.vehicle_name} · ${b.vehicle_plate}`, endMs, state, returned: !!b.return_reported_at });
  }
  for (const m of manual) {
    const r = revMap.get(`manual:${m.id}`);
    let state: string | null = r ? (r.status === "draft" ? "Entwurf" : r.manual_payout_status === "open" ? "Manuelle Rückzahlung offen" : null) : "Ungeprüft (Kaution nicht erfasst)";
    if (state) out.push({ source: "manual", id: m.id, name: m.customer_name, vehicle: `${m.vehicle_name ?? "Fahrzeug"} · ${m.vehicle_plate}`, endMs: Date.parse(m.end_at), state, returned: false });
  }
  return out.sort((a, b) => b.endMs - a.endMs);
}

function depositOf(ctx: DepositContext): number {
  if (ctx.depositCents == null) throw new Error("Kaution nicht erfasst: bitte zuerst den tatsächlich erhaltenen Betrag eintragen");
  return ctx.depositCents;
}

/** Entwurf speichern: bewegt kein Geld, sendet keine Mail. Optimistische Revision. */
export async function saveDraft(adminId: string, source: Source, id: string, expectedRevision: number | null, items: unknown, message: string | null) {
  const ctx = await loadDepositContext(source, id);
  if (ctx.review?.status === "finalized") throw new Error("Bereits abgeschlossen");
  const priced = priceItems(items, ctx.facts);
  const msg = (message ?? "").trim().slice(0, MAX_MESSAGE) || null;
  const d = await db();
  const stored = priced.map(({ type, quantity, amount_cents, reason }) => ({ type, quantity, amount_cents, reason }));
  if (!ctx.review) {
    if (expectedRevision != null) throw new Error("Entwurf wurde inzwischen geändert, bitte neu laden");
    const res = await d.from("deposit_reviews").insert({ source_type: source, source_id: id, items: stored, customer_message: msg, updated_by: adminId }).select("revision").single();
    if (res.error?.code === "23505") throw new Error("Entwurf wurde parallel angelegt, bitte neu laden");
    return { revision: must(res, "Entwurf").revision as number };
  }
  if (expectedRevision !== ctx.review.revision) throw new Error("Entwurf wurde inzwischen geändert, bitte neu laden");
  const rows = must(await d.from("deposit_reviews").update({ items: stored, customer_message: msg, revision: ctx.review.revision + 1, updated_by: adminId }).eq("id", ctx.review.id).eq("revision", ctx.review.revision).eq("status", "draft").select("revision"), "Entwurf") as any[];
  if (!rows.length) throw new Error("Entwurf wurde inzwischen geändert, bitte neu laden");
  return { revision: rows[0].revision as number };
}

export async function recordManualDeposit(adminId: string, id: string, cents: number, method: string) {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 5_000_00) throw new Error("Betrag ungültig");
  if (!["cash", "transfer", "sumup", "none", "other"].includes(method)) throw new Error("Zahlungsart ungültig");
  if (method === "none" && cents !== 0) throw new Error("Ohne Kaution muss der Betrag 0 sein");
  const d = await db();
  const ex = must(await d.from("deposit_reviews").select("id, status, revision").eq("source_type", "manual").eq("source_id", id).maybeSingle(), "Prüfung") as any;
  const patch = { manual_deposit_cents: cents, manual_deposit_method: method, manual_deposit_recorded_at: new Date().toISOString(), manual_deposit_recorded_by: adminId, updated_by: adminId };
  if (!ex) must(await d.from("deposit_reviews").insert({ source_type: "manual", source_id: id, ...patch }), "Kaution");
  else {
    if (ex.status === "finalized") throw new Error("Bereits abgeschlossen");
    must(await d.from("deposit_reviews").update({ ...patch, revision: ex.revision + 1 }).eq("id", ex.id).eq("status", "draft"), "Kaution");
  }
}

function storedPriced(ctx: DepositContext): PricedItem[] {
  return priceItems(ctx.review?.items ?? [], ctx.facts);
}

export function totalsFor(ctx: DepositContext): Totals {
  return computeTotals(depositOf(ctx), storedPriced(ctx));
}

export async function previewClosingMail(source: Source, id: string, items: unknown, message: string | null) {
  const ctx = await loadDepositContext(source, id);
  const priced = priceItems(items, ctx.facts);
  const totals = computeTotals(depositOf(ctx), priced);
  const mail = buildCustomerClosingMail({
    to: ctx.email ?? "keine-adresse@invalid", firstName: ctx.firstName, vehicle: ctx.vehicle, startMs: ctx.startMs, endMs: ctx.endMs,
    totals, items: priced, message, payout: { kind: "preview" }, channel: source === "booking" ? "stripe" : "manual",
  });
  return { subject: mail.subject, html: mail.html, text: mail.text, totals, to: ctx.email };
}

/** Bewusster Abschluss. Summen ausschließlich aus dem gespeicherten Entwurf (Revision) berechnet. */
export async function finalizeReview(adminId: string, source: Source, id: string, expectedRevision: number, confirmName: string, confirmRefundCents: number) {
  const ctx = await loadDepositContext(source, id);
  if (!ctx.review) throw new Error("Bitte zuerst einen Entwurf speichern");
  if (ctx.review.status !== "finalized") {
    if (ctx.review.revision !== expectedRevision) throw new Error("Entwurf wurde inzwischen geändert, bitte neu laden");
    const t = totalsFor(ctx);
    if (confirmName.trim() !== ctx.customerName.trim()) throw new Error("Name zur Bestätigung stimmt nicht");
    if (confirmRefundCents !== t.refundCents) throw new Error("Bestätigter Rückzahlungsbetrag stimmt nicht mit dem Entwurf überein");
    if (source === "booking" && t.refundCents > 0 && !ctx.stripe?.paymentIntentId) throw new Error("Keine eindeutig zugeordnete Stripe-Zahlung: bitte manuell prüfen");
    const d = await db();
    const res = must(await d.rpc("finalize_deposit_review", {
      _id: ctx.review.id, _expected_revision: expectedRevision, _admin: adminId,
      _deposit: t.depositCents, _total: t.totalCents, _applied: t.appliedCents, _outstanding: t.outstandingCents, _refund: t.refundCents,
    }), "Abschluss") as { result: string };
    if (res.result === "stale_revision") throw new Error("Entwurf wurde inzwischen geändert, bitte neu laden");
    if (res.result === "cancelled") throw new Error("Buchung wurde storniert: Kaution ist dort abgerechnet");
    if (res.result !== "finalized" && res.result !== "already_finalized") throw new Error("Abschluss nicht möglich");
  }
  return continueSettlement(adminId, source, id);
}

/** Setzt einen abgeschlossenen Vorgang fort (Doppelklick/Reload/Timeout): gleicher Auftrag, gleicher Key. */
export async function continueSettlement(adminId: string, source: Source, id: string) {
  const ctx = await loadDepositContext(source, id);
  const r = ctx.review;
  if (!r || r.status !== "finalized") throw new Error("Nicht abgeschlossen");
  if (source === "booking") {
    const { requestDepositSettlement } = await import("@/lib/deposit-settlement.server");
    const { productionDeps } = await import("@/lib/deposit-settlement-deps.server");
    const { settlement } = await requestDepositSettlement(productionDeps(), {
      bookingId: id, deductCents: r.final_deduct_applied_cents!, adminId, requestKey: `review-${r.id}`,
    });
    if (settlement.deduct_cents !== r.final_deduct_applied_cents || settlement.refund_cents !== r.final_refund_cents) {
      throw new Error("Vorhandener Erstattungsauftrag weicht vom Abschluss ab: manuell prüfen, keine neue Erstattung");
    }
    if (!r.settlement_id) {
      const d = await db();
      must(await d.from("deposit_reviews").update({ settlement_id: settlement.id }).eq("id", r.id).is("settlement_id", null), "Verknüpfung");
    }
  }
  await ensureClosingMail(source, id).catch((e) => console.warn("[kaution] Kundenmail noch nicht erstellt", String((e as Error)?.message ?? e).slice(0, 160)));
  return loadDepositContext(source, id);
}

export async function confirmManualPayout(adminId: string, id: string, method: string, confirmRefundCents: number) {
  if (!["cash", "transfer", "sumup", "other"].includes(method)) throw new Error("Zahlungsart ungültig");
  const ctx = await loadDepositContext("manual", id);
  const r = ctx.review;
  if (!r || r.status !== "finalized") throw new Error("Nicht abgeschlossen");
  if (r.manual_payout_status !== "open") throw new Error("Keine offene manuelle Rückzahlung");
  if (confirmRefundCents !== r.final_refund_cents) throw new Error("Betrag stimmt nicht");
  const d = await db();
  const rows = must(await d.from("deposit_reviews").update({ manual_payout_status: "confirmed", manual_payout_method: method, manual_payout_confirmed_at: new Date().toISOString(), manual_payout_confirmed_by: adminId, updated_by: adminId }).eq("id", r.id).eq("manual_payout_status", "open").select("id"), "Bestätigung") as any[];
  if (!rows.length) throw new Error("Bereits bestätigt");
  await ensureClosingMail("manual", id).catch(() => undefined);
  return loadDepositContext("manual", id);
}

/** Zahlungsstand für die Kundenmail; null ⇒ (noch) keine Mail (Fehler/unklar bleibt Admin-Aufgabe). */
export function payoutStateFor(ctx: DepositContext): PayoutState | null {
  const r = ctx.review;
  if (!r || r.status !== "finalized") return null;
  if ((r.final_refund_cents ?? 0) === 0) {
    if (ctx.source === "booking") {
      const s = ctx.settlements.find((x) => x.id === r.settlement_id);
      if (!s || s.status !== "no_refund") return null;
    }
    return { kind: "none_due" };
  }
  if (ctx.source === "manual") {
    return r.manual_payout_status === "confirmed" ? { kind: "manual_confirmed", method: (r.manual_payout_method ?? "other") as "cash" } : null;
  }
  const s = ctx.settlements.find((x) => x.id === r.settlement_id);
  if (!s) return null;
  if (s.status === "succeeded") return { kind: "stripe_succeeded" };
  if (s.status === "pending") return { kind: "stripe_pending" };
  return null;
}

/** Friert genau eine Kundenmail je Vorgang ein; nie bei bekanntem Bounce, nie ohne realen Zahlungsstand. */
export async function ensureClosingMail(source: Source, id: string): Promise<"queued" | "exists" | "not_ready" | "no_email" | "bounced"> {
  const ctx = await loadDepositContext(source, id);
  if (ctx.closingMail) return "exists";
  const payout = payoutStateFor(ctx);
  if (!payout) return "not_ready";
  if (!ctx.email) return "no_email";
  if (ctx.knownBounce) return "bounced";
  const r = ctx.review!;
  const mail = buildCustomerClosingMail({
    to: ctx.email, firstName: ctx.firstName, vehicle: ctx.vehicle, startMs: ctx.startMs, endMs: ctx.endMs,
    totals: {
      depositCents: r.final_deposit_cents!, totalCents: r.final_deduct_total_cents!, appliedCents: r.final_deduct_applied_cents!,
      outstandingCents: r.final_outstanding_cents!, refundCents: r.final_refund_cents!,
    },
    items: priceItemsFrozen(r.items), message: r.customer_message, payout, channel: source === "booking" ? "stripe" : "manual",
  });
  const { insertRow, processOutboxRowById } = await import("@/lib/customer-mail-outbox.server");
  const row = await insertRow({ source_type: source, source_id: id, kind: "deposit_closing", due_at: new Date().toISOString(), recipient_email: ctx.email, payload: mail });
  await processOutboxRowById(row.id).catch(() => undefined);
  return "queued";
}

/** Abgeschlossene Positionen sind bereits geprüft; nur Darstellung ohne erneute Fakten-Regeln. */
function priceItemsFrozen(items: unknown): PricedItem[] {
  return priceItems(items, { extraKmChargeCents: null, extraKmAlreadyPaid: false, extraKm: null, missingTags: [], exceptions: {} }, { frozen: true });
}

export async function depositMailPrecheck(row: OutboxRow): Promise<string | null> {
  if (row.kind === "deposit_digest") return null;
  const source = row.source_type as Source;
  let ctx: DepositContext;
  try {
    ctx = await loadDepositContext(source, row.source_id);
  } catch (e) {
    if (/nicht gefunden/.test(String((e as Error)?.message))) return "Quelle gelöscht";
    throw e;
  }
  const text = (row.payload as { text?: string } | null)?.text ?? "";
  if (row.kind === "deposit_review_admin") {
    return adminMailStillValid({
      bookingStatus: ctx.status, depositStatus: ctx.depositStatus, reviewFinalized: ctx.review?.status === "finalized",
      endMs: ctx.endMs, returnReportedMs: ctx.returnReportedMs, nowMs: Date.now(), frozenText: text,
    });
  }
  const stop = closingMailStillValid({
    reviewFinalized: ctx.review?.status === "finalized", payout: payoutStateFor(ctx),
    refundCents: ctx.review?.final_refund_cents ?? null, frozenText: text,
  });
  if (stop) return stop;
  if (row.recipient_email && (await hasPermanentBounce(row.recipient_email))) return "Adresse dauerhaft unzustellbar (bekannter Bounce)";
  return null;
}

/** Teil des 5-Minuten-Outbox-Jobs. Stripe nur lesend; Mails ab Aktivierung. */
export async function runDepositSweep(nowMs = Date.now()): Promise<Record<string, number>> {
  const d = await db();
  const stats = { deposit_synced: 0, deposit_admin_enqueued: 0, deposit_digest: 0, deposit_closing: 0 };
  try {
    const { syncOpenSettlements } = await import("@/lib/deposit-settlement.server");
    const { productionDeps } = await import("@/lib/deposit-settlement-deps.server");
    stats.deposit_synced = (await syncOpenSettlements(productionDeps(), 25)).synced;
  } catch (e) {
    console.warn("[kaution] Statusabgleich", String((e as Error)?.message ?? e).slice(0, 160));
  }
  const settings = must(await d.from("customer_mail_settings").select("deposit_review_from").eq("id", true).maybeSingle(), "Einstellungen") as { deposit_review_from: string | null } | null;
  const from = settings?.deposit_review_from;
  if (!from) return stats;
  const { insertRow } = await import("@/lib/customer-mail-outbox.server");

  const due = (must(await d.rpc("deposit_review_due_sources", { _from: from, _limit: 20 }), "Fällig") ?? []) as { source_type: Source; source_id: string }[];
  for (const s of due) {
    try {
      const ctx = await loadDepositContext(s.source_type, s.source_id);
      const mail = buildAdminReviewMail({ ...ctx, sourceType: s.source_type, sourceId: s.source_id, checklist: ctx.checklist });
      await insertRow({ source_type: s.source_type, source_id: s.source_id, kind: "deposit_review_admin", due_at: new Date(nowMs).toISOString(), recipient_email: ADMIN_RECIPIENT, payload: mail });
      stats.deposit_admin_enqueued++;
    } catch (e) {
      console.warn("[kaution] Adminhinweis", String((e as Error)?.message ?? e).slice(0, 160));
    }
  }

  const { date, hour } = berlinDateAndHour(nowMs);
  if (hour >= DIGEST_HOUR_BERLIN) {
    const sid = digestSourceId(date);
    const exists = must(await d.from("customer_mail_outbox").select("id").eq("source_type", "digest").eq("source_id", sid).eq("kind", "deposit_digest").maybeSingle(), "Digest");
    if (!exists) {
      const fromMs = Date.parse(from);
      const all = (await listOpenDeposits()).filter((x) => x.endMs >= fromMs);
      const toEntry = (x: (typeof all)[number]): DigestEntry => ({ name: x.name, vehicle: x.vehicle, endMs: x.endMs, state: x.state, sourceType: x.source, sourceId: x.id });
      const pending = all.filter((x) => x.state === "Stripe ausstehend").map(toEntry);
      const open = all.filter((x) => x.state !== "Stripe ausstehend").map(toEntry);
      if (open.length + pending.length > 0) {
        const endOfDay = new Date(nowMs + 14 * 3600_000).toISOString();
        await insertRow({ source_type: "digest", source_id: sid, kind: "deposit_digest", due_at: new Date(nowMs).toISOString(), recipient_email: ADMIN_RECIPIENT, payload: buildDigestMail(date.split("-").reverse().join("."), open, pending), expires_at: endOfDay });
        stats.deposit_digest++;
      }
    }
  }

  const fin = must(await d.from("deposit_reviews").select("source_type, source_id").eq("status", "finalized").gte("finalized_at", new Date(nowMs - 30 * 86400_000).toISOString()).limit(50), "Abschlüsse") as { source_type: Source; source_id: string }[];
  for (const f of fin) {
    try {
      if ((await ensureClosingMail(f.source_type, f.source_id)) === "queued") stats.deposit_closing++;
    } catch {
      /* bleibt für den nächsten Lauf */
    }
  }
  return stats;
}

