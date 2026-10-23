// Produktive Adapter für stripe-refund-sync.server.ts (Service-Role-DB, Stripe via Gateway, nur lesend).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient } from "@/lib/stripe.server";
import { productionDeps } from "@/lib/deposit-settlement-deps.server";
import type { Env } from "@/lib/deposit-settlement.server";
import type { MirrorDeps, StripeRefundFull } from "@/lib/stripe-refund-sync.server";

const db = supabaseAdmin as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any };
const idOf = (x: any): string | null => (typeof x === "string" ? x : x?.id ?? null);
const notFound = (e: any) => e?.statusCode === 404 || e?.code === "resource_missing" || e?.raw?.code === "resource_missing";

export const toFull = (r: any): StripeRefundFull => ({
  id: r.id,
  status: r.status ?? null,
  amount: r.amount,
  currency: r.currency ?? null,
  payment_intent: idOf(r.payment_intent),
  charge: idOf(r.charge),
  failure_reason: r.failure_reason ?? null,
  reason: r.reason ?? null,
  created: r.created ?? null,
  metadata: r.metadata ?? null,
});

export function mirrorDeps(): MirrorDeps {
  return {
    async retrieveRefund(env: Env, id) {
      try {
        return toFull(await createStripeClient(env).refunds.retrieve(id));
      } catch (e) {
        if (notFound(e)) return null;
        throw e;
      }
    },
    async listRefundsForPi(env, pi) {
      const res = await createStripeClient(env).refunds.list({ payment_intent: pi, limit: 100 });
      return res.data.map(toFull);
    },
    async listRecentRefunds(env, since, max) {
      const out: StripeRefundFull[] = [];
      for await (const r of createStripeClient(env).refunds.list({ created: { gte: since }, limit: 100 })) {
        out.push(toFull(r));
        if (out.length >= max) break;
      }
      return out;
    },
    async findBookingByPi(pi) {
      const { data, error } = await db.from("bookings").select("id").eq("stripe_payment_intent_id", pi).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async getSettlementKind(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const { data, error } = await db.from("deposit_settlements").select("id, kind, booking_id").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async upsert(row) {
      const { data, error } = await db.rpc("upsert_stripe_refund", {
        _refund_id: row.refund_id, _environment: row.environment, _payment_intent_id: row.payment_intent_id, _charge_id: row.charge_id,
        _booking_id: row.booking_id, _settlement_id: row.settlement_id, _origin: row.origin, _allocation: row.allocation,
        _amount_cents: row.amount_cents, _currency: row.currency, _status: row.status, _failure_reason: row.failure_reason,
        _reason: row.reason, _stripe_created_at: row.stripe_created_at,
      });
      if (error) throw new Error(error.message);
      return data as { inserted: boolean; status: string; notify: boolean };
    },
    async markNotified(refundId) {
      await db.from("stripe_refunds").update({ admin_notified_at: new Date().toISOString() }).eq("refund_id", refundId).is("admin_notified_at", null);
    },
    async notifyAdmin(title, body, bookingId) {
      await db.from("admin_notifications").insert({ type: "email_failed", title, body, booking_id: bookingId });
    },
    settlement: productionDeps(),
  };
}

/** Event-Dedupe am Webhook. */
export async function claimStripeEvent(eventId: string, env: Env, type: string): Promise<"new" | "duplicate" | "busy"> {
  const { data, error } = await db.rpc("claim_stripe_event", { _event_id: eventId, _environment: env, _type: type });
  if (error) throw new Error(error.message);
  return data;
}
export async function finishStripeEvent(eventId: string, ok: boolean, err?: string) {
  await db.from("stripe_webhook_events").update(ok ? { status: "processed", processed_at: new Date().toISOString(), last_error: null } : { status: "failed", last_error: (err ?? "").slice(0, 500) }).eq("event_id", eventId);
}
