// Spiegelt jede Stripe-Erstattung (App- oder Dashboard-initiiert) pro refund_id in
// stripe_refunds. Stripe ist maßgeblich: es wird immer der frisch gelesene Refund
// übernommen; die DB-Funktion upsert_stripe_refund stuft Status nie zurück.
// Nie neue Geldflüsse. Fremde (Dashboard-)Refunds werden NIE einer Kaution
// zugerechnet, sondern als "unallocated" markiert und blockieren Auszahlungen.
import { syncRefundFromWebhook, type Deps as SettlementDeps, type Env } from "@/lib/deposit-settlement.server";

export type StripeRefundFull = {
  id: string;
  status: string | null;
  amount: number;
  currency: string | null;
  payment_intent: string | null;
  charge: string | null;
  failure_reason: string | null;
  reason: string | null;
  created: number | null;
  metadata: Record<string, string> | null;
};

export type MirrorRow = {
  refund_id: string;
  environment: Env;
  payment_intent_id: string | null;
  charge_id: string | null;
  booking_id: string | null;
  settlement_id: string | null;
  origin: "app_settlement" | "app_conflict" | "external";
  allocation: "deposit" | "cancellation" | "legacy" | "conflict" | "unallocated";
  amount_cents: number;
  currency: string | null;
  status: string;
  failure_reason: string | null;
  reason: string | null;
  stripe_created_at: string | null;
};

export interface MirrorDeps {
  retrieveRefund(env: Env, id: string): Promise<StripeRefundFull | null>;
  listRefundsForPi(env: Env, pi: string): Promise<StripeRefundFull[]>;
  listRecentRefunds(env: Env, sinceUnix: number, max: number): Promise<StripeRefundFull[]>;
  findBookingByPi(pi: string): Promise<{ id: string } | null>;
  getSettlementKind(id: string): Promise<{ id: string; kind: string; booking_id: string } | null>;
  upsert(row: MirrorRow): Promise<{ inserted: boolean; status: string; notify: boolean }>;
  markNotified(refundId: string): Promise<void>;
  notifyAdmin(title: string, body: string, bookingId: string | null): Promise<void>;
  settlement: SettlementDeps | null;
}

const eur = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;

export async function classify(d: MirrorDeps, r: StripeRefundFull): Promise<Pick<MirrorRow, "origin" | "allocation" | "settlement_id" | "booking_id">> {
  const booking = r.payment_intent ? await d.findBookingByPi(r.payment_intent) : null;
  const sid = r.metadata?.settlement_id;
  if (sid) {
    const s = await d.getSettlementKind(sid);
    // Nur übernehmen, wenn Auftrag existiert und zur selben Buchung gehört.
    if (s && (!booking || s.booking_id === booking.id)) {
      const alloc = s.kind === "deposit" || s.kind === "cancellation" || s.kind === "legacy" ? s.kind : "unallocated";
      return { origin: "app_settlement", allocation: alloc, settlement_id: s.id, booking_id: s.booking_id };
    }
  }
  if (r.metadata?.kind === "double_booking_conflict") return { origin: "app_conflict", allocation: "conflict", settlement_id: null, booking_id: booking?.id ?? null };
  return { origin: "external", allocation: "unallocated", settlement_id: null, booking_id: booking?.id ?? null };
}

/** Übernimmt einen Refund anhand des frisch gelesenen Stripe-Stands. */
export async function mirrorRefund(d: MirrorDeps, env: Env, fresh: StripeRefundFull): Promise<MirrorRow> {
  const c = await classify(d, fresh);
  const row: MirrorRow = {
    refund_id: fresh.id,
    environment: env,
    payment_intent_id: fresh.payment_intent,
    charge_id: fresh.charge,
    ...c,
    amount_cents: fresh.amount,
    currency: fresh.currency,
    status: fresh.status ?? "unknown",
    failure_reason: fresh.failure_reason,
    reason: fresh.reason,
    stripe_created_at: fresh.created ? new Date(fresh.created * 1000).toISOString() : null,
  };
  const res = await d.upsert(row);
  if (c.origin === "app_settlement" && d.settlement) {
    await syncRefundFromWebhook(d.settlement, env, fresh.id);
  }
  if (res.notify && fresh.status !== "failed" && fresh.status !== "canceled") {
    await d.notifyAdmin(
      "Erstattung direkt in Stripe erkannt – manuell zuordnen",
      `${eur(fresh.amount)} (${fresh.status}) auf Zahlung ${fresh.payment_intent ?? "?"} · Refund ${fresh.id}. ` +
        "Nicht automatisch als Kaution verbucht; weitere Kautionsrückzahlungen für diese Zahlung sind gesperrt, bis geprüft.",
      c.booking_id,
    ).catch(() => undefined);
    await d.markNotified(fresh.id).catch(() => undefined);
  }
  return { ...row, status: res.status };
}

export async function mirrorRefundById(d: MirrorDeps, env: Env, refundId: string) {
  const fresh = await d.retrieveRefund(env, refundId);
  if (!fresh) return null;
  return mirrorRefund(d, env, fresh);
}

export async function mirrorPaymentIntent(d: MirrorDeps, env: Env, pi: string) {
  const list = await d.listRefundsForPi(env, pi);
  const out: MirrorRow[] = [];
  for (const r of list) out.push(await mirrorRefund(d, env, r));
  return out;
}

/** Abgleich verpasster Events: alle Refunds seit sinceUnix je Umgebung. */
export async function reconcileRecentRefunds(d: MirrorDeps, envs: Env[], sinceUnix: number, max = 300) {
  let mirrored = 0;
  let errors = 0;
  for (const env of envs) {
    let list: StripeRefundFull[] = [];
    try {
      list = await d.listRecentRefunds(env, sinceUnix, max);
    } catch {
      errors++;
      continue;
    }
    for (const r of list) {
      try {
        await mirrorRefund(d, env, r);
        mirrored++;
      } catch {
        errors++;
      }
    }
  }
  return { mirrored, errors };
}

/** Summen je Zahlung ohne Doppelzählung (eine Zeile pro refund_id). */
export function refundTotals(rows: Pick<MirrorRow, "status" | "amount_cents" | "origin">[]) {
  const t = { succeededCents: 0, pendingCents: 0, failedCents: 0, externalActiveCents: 0 };
  for (const r of rows) {
    if (r.status === "succeeded") t.succeededCents += r.amount_cents;
    else if (r.status === "failed" || r.status === "canceled") t.failedCents += r.amount_cents;
    else t.pendingCents += r.amount_cents;
    if (r.origin === "external" && r.status !== "failed" && r.status !== "canceled") t.externalActiveCents += r.amount_cents;
  }
  return t;
}
