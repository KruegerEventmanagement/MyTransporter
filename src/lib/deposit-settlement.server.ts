// Orchestrierung von Kautionsabrechnung und Storno-Erstattung gegen Stripe.
// Ein Auftrag (deposit_settlements) friert Betrag, Umgebung und Idempotenz-Key
// vor jedem externen Schreiben ein. Wiederholungen rekonstruieren immer
// denselben Refund; Statusabgleich (sync) löst nie neue Geldflüsse aus.
import {
  IDEMPOTENCY_WINDOW_MS,
  TERMINAL_STATUSES,
  computeCancellationFeeCents,
  computeCancellationRefund,
  computeDepositSettlement,
  eurToCents,
  isDefinitiveStripeRejection,
  mapRefundStatus,
  type SettlementKind,
  type SettlementStatus,
} from "@/lib/deposit-settlement";
import { paidCustomKmCents } from "@/lib/custom-km";

export type Env = "sandbox" | "live";

export type SettlementRow = {
  id: string;
  booking_id: string;
  kind: SettlementKind;
  environment: Env;
  payment_intent_id: string;
  idempotency_key: string;
  request_key: string | null;
  deposit_cents: number;
  deduct_cents: number;
  fee_cents: number;
  refund_cents: number;
  status: SettlementStatus;
  refund_id: string | null;
  refund_status: string | null;
  failure_reason: string | null;
  requested_by: string | null;
  requested_at: string;
  stripe_called_at: string | null;
  confirmed_at: string | null;
  last_synced_at: string | null;
};

export type BookingRow = {
  id: string;
  user_id: string;
  status: string;
  start_date: string;
  start_hour: number;
  start_km: number | null;
  plan_price: number | string;
  deposit: number | string;
  deposit_status: string;
  deposit_deducted_cents: number | null;
  deposit_refund_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_environment: Env | null;
  remarks: string | null;
  addons: unknown;
};

export type RefundLike = {
  id: string;
  status: string | null;
  amount: number;
  payment_intent: string | null;
  failure_reason?: string | null;
  metadata?: Record<string, string> | null;
};

export interface SettlementStore {
  getBooking(id: string): Promise<BookingRow | null>;
  setBookingEnvironment(id: string, env: Env): Promise<void>;
  updateBooking(id: string, patch: Record<string, unknown>): Promise<void>;
  listSettlements(bookingId: string): Promise<SettlementRow[]>;
  getSettlement(id: string): Promise<SettlementRow | null>;
  findByRefundId(refundId: string): Promise<SettlementRow | null>;
  /** null ⇒ Unique-Konflikt (Lock/Doppelauftrag). */
  insertSettlement(row: Omit<SettlementRow, "id" | "requested_at" | "stripe_called_at" | "confirmed_at" | "last_synced_at" | "refund_status" | "failure_reason"> & Partial<SettlementRow> & { id: string }): Promise<SettlementRow | null>;
  updateSettlement(id: string, patch: Partial<SettlementRow>): Promise<SettlementRow>;
  /** Setzt stripe_called_at nur, wenn noch leer. */
  markStripeCalled(id: string, at: string): Promise<SettlementRow>;
  listOpen(limit: number): Promise<SettlementRow[]>;
  notifyAdmin(title: string, body: string, bookingId: string): Promise<void>;
}

export interface RefundApi {
  createRefund(env: Env, params: { payment_intent: string; amount: number; metadata: Record<string, string> }, idempotencyKey: string): Promise<RefundLike>;
  retrieveRefund(env: Env, id: string): Promise<RefundLike | null>;
  listRefunds(env: Env, paymentIntentId: string): Promise<RefundLike[]>;
  /** null ⇒ in dieser Umgebung nicht vorhanden. */
  retrievePaymentIntent(env: Env, id: string): Promise<{ id: string; amount_received: number; status: string } | null>;
}

export type Deps = { store: SettlementStore; stripe: RefundApi; now?: () => number; newId?: () => string };

const nowIso = (d: Deps) => new Date((d.now ?? Date.now)()).toISOString();
const isTerminal = (s: SettlementStatus) => TERMINAL_STATUSES.includes(s);

/** Umgebung der Originalzahlung: persistiert, sonst read-only in beiden Umgebungen gesucht. */
export async function resolveEnvironment(d: Deps, booking: BookingRow): Promise<Env> {
  if (booking.stripe_environment) return booking.stripe_environment;
  const pi = booking.stripe_payment_intent_id;
  if (!pi) throw new Error("Keine Stripe-Zahlung für diese Buchung gefunden");
  const found: Env[] = [];
  for (const env of ["live", "sandbox"] as Env[]) {
    try {
      if (await d.stripe.retrievePaymentIntent(env, pi)) found.push(env);
    } catch {
      throw new Error("Stripe-Umgebung nicht eindeutig bestimmbar (Stripe nicht erreichbar) – bitte später erneut");
    }
  }
  if (found.length !== 1) throw new Error("Stripe-Umgebung der Zahlung nicht eindeutig – manuelle Prüfung nötig");
  await d.store.setBookingEnvironment(booking.id, found[0]);
  return found[0];
}

async function applyBookingState(d: Deps, row: SettlementRow) {
  const s = row.status;
  const confirmed = s === "succeeded" || s === "no_refund";
  if (confirmed) {
    await d.store.updateBooking(row.booking_id, {
      deposit_status: "released",
      deposit_released_at: row.confirmed_at ?? nowIso(d),
      deposit_released_by: row.requested_by,
      deposit_deducted_cents: row.kind === "cancellation" ? row.fee_cents : row.deduct_cents,
      deposit_refund_id: row.refund_id,
    });
  } else if (s === "pending" || s === "requires_action" || s === "processing") {
    await d.store.updateBooking(row.booking_id, { deposit_status: "refund_pending", ...(row.refund_id ? { deposit_refund_id: row.refund_id } : {}) });
  } else if (s === "failed" || s === "canceled") {
    if (row.kind !== "legacy") await d.store.updateBooking(row.booking_id, { deposit_status: "held" });
  }
}

/** Übernimmt einen (frisch von Stripe gelesenen) Refund – nur bei verifizierter Zuordnung. */
async function applyRefund(d: Deps, row: SettlementRow, refund: RefundLike): Promise<SettlementRow> {
  const at = nowIso(d);
  if (refund.payment_intent !== row.payment_intent_id || refund.amount !== row.refund_cents) {
    const updated = await d.store.updateSettlement(row.id, {
      status: "needs_review",
      refund_status: refund.status,
      failure_reason: "Stripe-Refund passt nicht zu Zahlung/Betrag – manuell prüfen",
      last_synced_at: at,
    });
    return updated;
  }
  const status = mapRefundStatus(refund.status);
  const updated = await d.store.updateSettlement(row.id, {
    refund_id: refund.id,
    refund_status: refund.status,
    status,
    failure_reason: status === "failed" || status === "canceled" ? refund.failure_reason ?? refund.status : status === "needs_review" ? `Unbekannter Stripe-Status ${refund.status}` : null,
    confirmed_at: status === "succeeded" ? row.confirmed_at ?? at : row.confirmed_at,
    last_synced_at: at,
  });
  await applyBookingState(d, updated);
  if (status === "failed" || status === "requires_action") {
    await d.store.notifyAdmin(
      status === "failed" ? "Kautions-/Storno-Erstattung fehlgeschlagen" : "Erstattung benötigt Aktion bei Stripe",
      `Auftrag ${row.id} · ${(row.refund_cents / 100).toFixed(2)} € · ${refund.failure_reason ?? refund.status}`,
      row.booking_id,
    ).catch(() => undefined);
  }
  return updated;
}

/**
 * Führt einen Auftrag aus bzw. gleicht ihn ab.
 * mayCreate=false (Webhook/Cron/Status-Button) erzeugt NIE einen Refund.
 */
export async function executeSettlement(d: Deps, input: SettlementRow, opts: { mayCreate: boolean }): Promise<SettlementRow> {
  let row = input;
  if (isTerminal(row.status) && row.status !== "succeeded") return row;
  if (row.kind === "legacy" && !row.refund_id) return row; // nur manuelle Prüfung
  const at = nowIso(d);

  if (row.refund_cents === 0 && row.kind !== "legacy") {
    if (row.status === "no_refund") return row;
    const updated = await d.store.updateSettlement(row.id, { status: "no_refund", confirmed_at: at, last_synced_at: at, failure_reason: null });
    await applyBookingState(d, updated);
    return updated;
  }

  if (row.refund_id) {
    const refund = await d.stripe.retrieveRefund(row.environment, row.refund_id);
    if (!refund) return d.store.updateSettlement(row.id, { status: "needs_review", failure_reason: "Refund bei Stripe nicht gefunden", last_synced_at: at });
    return applyRefund(d, row, refund);
  }
  if (row.status === "succeeded") return row;

  // Rekonstruktion: wurde der Refund schon angelegt (Timeout/DB-Fehler danach)?
  const refunds = await d.stripe.listRefunds(row.environment, row.payment_intent_id);
  const own = refunds.find((r) => r.metadata?.settlement_id === row.id);
  if (own) return applyRefund(d, row, own);

  const calledMs = row.stripe_called_at ? Date.parse(row.stripe_called_at) : null;
  const expired = calledMs != null && (d.now ?? Date.now)() - calledMs > IDEMPOTENCY_WINDOW_MS;
  if (expired) {
    return d.store.updateSettlement(row.id, {
      status: "needs_review",
      failure_reason: "Früherer Stripe-Aufruf ohne auffindbaren Refund nach Ablauf der Idempotenz – nicht erneut erstattet, bitte manuell prüfen",
      last_synced_at: at,
    });
  }
  if (!opts.mayCreate) {
    return d.store.updateSettlement(row.id, { last_synced_at: at });
  }

  // Fremde/frühere Erstattungen auf der Originalzahlung berücksichtigen.
  const pi = await d.stripe.retrievePaymentIntent(row.environment, row.payment_intent_id);
  if (!pi) return d.store.updateSettlement(row.id, { status: "needs_review", failure_reason: "Originalzahlung in der gespeicherten Umgebung nicht gefunden", last_synced_at: at });
  const alreadyRefunded = refunds
    .filter((r) => r.status !== "failed" && r.status !== "canceled")
    .reduce((s, r) => s + r.amount, 0);
  const remaining = pi.amount_received - alreadyRefunded;
  if (row.refund_cents > remaining) {
    return d.store.updateSettlement(row.id, {
      status: "needs_review",
      failure_reason: `Erstattbarer Rest der Zahlung (${(remaining / 100).toFixed(2)} €) kleiner als Auftrag – andere Erstattungen vorhanden, manuell prüfen`,
      last_synced_at: at,
    });
  }

  row = await d.store.markStripeCalled(row.id, at);
  let refund: RefundLike;
  try {
    refund = await d.stripe.createRefund(
      row.environment,
      {
        payment_intent: row.payment_intent_id,
        amount: row.refund_cents,
        metadata: { settlement_id: row.id, booking_id: row.booking_id, kind: row.kind },
      },
      row.idempotency_key,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isDefinitiveStripeRejection(e)) {
      const updated = await d.store.updateSettlement(row.id, { status: "failed", failure_reason: `Stripe lehnte ab: ${msg}`, last_synced_at: at });
      await applyBookingState(d, updated);
      return updated;
    }
    return d.store.updateSettlement(row.id, { status: "processing", failure_reason: `Ergebnis unklar (${msg}) – „Erneut versuchen“ nutzt denselben Auftrag`, last_synced_at: at });
  }
  return applyRefund(d, row, refund);
}

function activeOf(rows: SettlementRow[], kind?: SettlementKind) {
  return rows.find((r) => r.status !== "failed" && r.status !== "canceled" && (!kind || r.kind === kind)) ?? null;
}

export type RequestResult = { settlement: SettlementRow; reused: boolean };

export async function requestDepositSettlement(
  d: Deps,
  input: { bookingId: string; deductCents: number; adminId: string; requestKey: string },
): Promise<RequestResult> {
  const booking = await d.store.getBooking(input.bookingId);
  if (!booking) throw new Error("Buchung nicht gefunden");
  const rows = await d.store.listSettlements(booking.id);
  const same = rows.find((r) => r.request_key === input.requestKey);
  if (same) return { settlement: await executeSettlement(d, same, { mayCreate: true }), reused: true };
  const existing = activeOf(rows, "deposit") ?? activeOf(rows, "legacy");
  if (existing) return { settlement: existing, reused: true };
  const inflight = rows.find((r) => r.status === "processing" || r.status === "pending" || r.status === "requires_action" || r.status === "needs_review");
  if (inflight) throw new Error("Für diese Buchung läuft bereits eine Erstattung");
  if (activeOf(rows, "cancellation")) throw new Error("Buchung wurde storniert – Kaution ist dort abgerechnet");
  if (booking.deposit_status === "released") throw new Error("Kaution wurde bereits abgerechnet");

  const amounts = computeDepositSettlement({ depositEur: booking.deposit, deductCents: input.deductCents });
  if (amounts.refundCents > 0 && !booking.stripe_payment_intent_id) throw new Error("Keine Stripe-Zahlung für diese Buchung gefunden");
  const env = booking.stripe_payment_intent_id ? await resolveEnvironment(d, booking) : "live";
  const id = (d.newId ?? (() => crypto.randomUUID()))();
  const inserted = await d.store.insertSettlement({
    id,
    booking_id: booking.id,
    kind: "deposit",
    environment: env,
    payment_intent_id: booking.stripe_payment_intent_id ?? "none",
    idempotency_key: `mt-deposit-${id}`,
    request_key: input.requestKey,
    deposit_cents: amounts.depositCents,
    deduct_cents: amounts.deductCents,
    fee_cents: 0,
    refund_cents: amounts.refundCents,
    status: "processing",
    refund_id: null,
    requested_by: input.adminId,
  });
  if (!inserted) {
    const again = await d.store.listSettlements(booking.id);
    const winner = again.find((r) => r.request_key === input.requestKey) ?? activeOf(again, "deposit");
    if (winner) return { settlement: winner, reused: true };
    throw new Error("Für diese Buchung läuft bereits eine Erstattung");
  }
  return { settlement: await executeSettlement(d, inserted, { mayCreate: true }), reused: false };
}

export async function requestCancellation(
  d: Deps,
  input: { bookingId: string; userId: string; requestKey: string },
): Promise<RequestResult & { feeCents: number; hours: number }> {
  const booking = await d.store.getBooking(input.bookingId);
  if (!booking) throw new Error("Buchung nicht gefunden");
  if (booking.user_id !== input.userId) throw new Error("Nicht autorisiert");
  const rows = await d.store.listSettlements(booking.id);
  const prior = activeOf(rows, "cancellation");
  if (prior) {
    const s = prior.request_key === input.requestKey ? await executeSettlement(d, prior, { mayCreate: true }) : prior;
    return { settlement: s, reused: true, feeCents: prior.fee_cents, hours: 0 };
  }
  if (booking.status === "cancelled") throw new Error("Buchung ist bereits storniert");
  if (booking.start_km !== null) throw new Error("Fahrt wurde bereits gestartet und kann nicht mehr storniert werden");
  if (!booking.stripe_payment_intent_id) throw new Error("Keine Stripe-Zahlung für diese Buchung gefunden");
  if (rows.some((r) => r.status === "processing" || r.status === "pending" || r.status === "requires_action" || r.status === "needs_review")) {
    throw new Error("Für diese Buchung läuft bereits eine Erstattung – bitte kurz warten");
  }

  const startsAtMs = new Date(`${booking.start_date}T${String(booking.start_hour).padStart(2, "0")}:00:00`).getTime();
  const { hours, feeCents } = computeCancellationFeeCents(startsAtMs, (d.now ?? Date.now)());
  const depositAlreadySettled = !!(activeOf(rows, "deposit") ?? activeOf(rows, "legacy")) || booking.deposit_status === "released";
  const r = computeCancellationRefund({
    planPriceEur: booking.plan_price,
    depositEur: booking.deposit,
    kmPackageCents: paidCustomKmCents(booking.addons),
    feeCents,
    depositAlreadySettled,
  });
  const env = await resolveEnvironment(d, booking);
  const id = (d.newId ?? (() => crypto.randomUUID()))();
  const inserted = await d.store.insertSettlement({
    id,
    booking_id: booking.id,
    kind: "cancellation",
    environment: env,
    payment_intent_id: booking.stripe_payment_intent_id,
    idempotency_key: `mt-cancel-${id}`,
    request_key: input.requestKey,
    deposit_cents: r.depositCents,
    deduct_cents: 0,
    fee_cents: feeCents,
    refund_cents: r.refundCents,
    status: "processing",
    refund_id: null,
    requested_by: input.userId,
  });
  if (!inserted) throw new Error("Für diese Buchung läuft bereits eine Erstattung – bitte kurz warten");

  // Storno selbst ist sofort wirksam (Fahrzeug frei); Geldfluss separat nachverfolgt.
  const note = `Storniert am ${new Date((d.now ?? Date.now)()).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · Gebühr ${(feeCents / 100).toFixed(2)} € (${hours} h vor Abfahrt) · Erstattung ${(r.refundCents / 100).toFixed(2)} € angefordert`;
  await d.store.updateBooking(booking.id, { status: "cancelled", remarks: booking.remarks ? `${booking.remarks}\n${note}` : note });
  const settlement = await executeSettlement(d, inserted, { mayCreate: true });
  return { settlement, reused: false, feeCents, hours };
}

/** Status-Abgleich einer Buchung (Admin-Button): nie neuer Geldfluss. */
export async function refreshBookingSettlements(d: Deps, bookingId: string): Promise<SettlementRow[]> {
  const booking = await d.store.getBooking(bookingId);
  if (!booking) throw new Error("Buchung nicht gefunden");
  let rows = await d.store.listSettlements(bookingId);
  if (rows.length === 0 && booking.deposit_refund_id) {
    await importLegacyRefund(d, booking);
    rows = await d.store.listSettlements(bookingId);
  }
  const out: SettlementRow[] = [];
  for (const r of rows) out.push(isTerminal(r.status) && !r.refund_id ? r : await executeSettlement(d, r, { mayCreate: false }));
  return out;
}

/** Bestehende Alt-Refunds read-only übernehmen; nur bei bestätigter Zuordnung. */
export async function importLegacyRefund(d: Deps, booking: BookingRow): Promise<SettlementRow | null> {
  const refundId = booking.deposit_refund_id;
  const pi = booking.stripe_payment_intent_id;
  if (!refundId) return null;
  const id = (d.newId ?? (() => crypto.randomUUID()))();
  const base = {
    id,
    booking_id: booking.id,
    kind: "legacy" as const,
    payment_intent_id: pi ?? "none",
    idempotency_key: `mt-legacy-${refundId}`,
    request_key: null,
    deposit_cents: eurToCents(booking.deposit),
    deduct_cents: Math.max(0, booking.deposit_deducted_cents ?? 0),
    fee_cents: 0,
    requested_by: null,
  };
  let env: Env | null = null;
  try {
    env = pi ? await resolveEnvironment(d, booking) : null;
  } catch {
    env = null;
  }
  const refund = env ? await d.stripe.retrieveRefund(env, refundId) : null;
  if (!env || !refund || refund.payment_intent !== pi) {
    return d.store.insertSettlement({
      ...base,
      environment: env ?? "live",
      refund_cents: 0,
      refund_id: null,
      status: "needs_review",
      failure_reason: "Alt-Erstattung nicht eindeutig der Zahlung zuordenbar – manuell prüfen",
    } as never);
  }
  const at = nowIso(d);
  const status = mapRefundStatus(refund.status);
  const row = await d.store.insertSettlement({
    ...base,
    environment: env,
    refund_cents: refund.amount,
    refund_id: refund.id,
    refund_status: refund.status,
    status,
    confirmed_at: status === "succeeded" ? at : null,
    last_synced_at: at,
  } as never);
  if (row) await applyBookingState(d, row);
  return row;
}

/** Webhook: Refund-Ereignis anhand frisch gelesenem Stripe-Zustand übernehmen. */
export async function syncRefundFromWebhook(d: Deps, env: Env, refundId: string): Promise<"applied" | "ignored"> {
  let row = await d.store.findByRefundId(refundId);
  const fresh = await d.stripe.retrieveRefund(env, refundId);
  if (!fresh) return "ignored";
  if (!row && fresh.metadata?.settlement_id) row = await d.store.getSettlement(fresh.metadata.settlement_id);
  if (!row) return "ignored"; // fremde Erstattung – nie als Kaution ausgeben
  if (row.environment !== env || row.payment_intent_id !== fresh.payment_intent) return "ignored";
  if (row.refund_id && row.refund_id !== fresh.id) return "ignored";
  await applyRefund(d, row, fresh);
  return "applied";
}

/** Cron-Fallback: offene Aufträge read-only abgleichen. */
export async function syncOpenSettlements(d: Deps, limit = 25) {
  const rows = await d.store.listOpen(limit);
  let synced = 0;
  let errors = 0;
  for (const r of rows) {
    try {
      await executeSettlement(d, r, { mayCreate: false });
      synced++;
    } catch {
      errors++;
    }
  }
  return { checked: rows.length, synced, errors };
}
