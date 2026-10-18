// Produktive Adapter (DB via Service-Role, Stripe via Gateway) für deposit-settlement.server.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient } from "@/lib/stripe.server";
import type { Deps, Env, RefundLike, SettlementRow, SettlementStore, RefundApi, BookingRow } from "@/lib/deposit-settlement.server";

const db = supabaseAdmin as unknown as { from: (t: string) => any };
const BOOKING_COLS =
  "id, user_id, status, start_date, start_hour, start_km, plan_price, deposit, deposit_status, deposit_deducted_cents, deposit_refund_id, stripe_payment_intent_id, stripe_environment, remarks, addons";

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`DB: ${res.error.message}`);
  return res.data;
}

const store: SettlementStore = {
  async getBooking(id) {
    return must(await db.from("bookings").select(BOOKING_COLS).eq("id", id).maybeSingle()) as BookingRow | null;
  },
  async setBookingEnvironment(id, env) {
    must(await db.from("bookings").update({ stripe_environment: env }).eq("id", id).is("stripe_environment", null));
  },
  async updateBooking(id, patch) {
    must(await db.from("bookings").update(patch).eq("id", id));
  },
  async listSettlements(bookingId) {
    return must(await db.from("deposit_settlements").select("*").eq("booking_id", bookingId).order("created_at")) as SettlementRow[];
  },
  async getSettlement(id) {
    return must(await db.from("deposit_settlements").select("*").eq("id", id).maybeSingle()) as SettlementRow | null;
  },
  async findByRefundId(refundId) {
    return must(await db.from("deposit_settlements").select("*").eq("refund_id", refundId).maybeSingle()) as SettlementRow | null;
  },
  async insertSettlement(row) {
    const res = await db.from("deposit_settlements").insert(row).select("*").single();
    if (res.error?.code === "23505") return null;
    return must(res) as SettlementRow;
  },
  async updateSettlement(id, patch) {
    return must(await db.from("deposit_settlements").update(patch).eq("id", id).select("*").single()) as SettlementRow;
  },
  async markStripeCalled(id, at) {
    must(await db.from("deposit_settlements").update({ stripe_called_at: at }).eq("id", id).is("stripe_called_at", null));
    return must(await db.from("deposit_settlements").select("*").eq("id", id).single()) as SettlementRow;
  },
  async listOpen(limit) {
    return must(
      await db.from("deposit_settlements").select("*").in("status", ["processing", "pending", "requires_action"]).order("updated_at").limit(limit),
    ) as SettlementRow[];
  },
  async notifyAdmin(title, body, bookingId) {
    await db.from("admin_notifications").insert({ type: "email_failed", title, body, booking_id: bookingId });
  },
};

const toRefund = (r: any): RefundLike => ({
  id: r.id,
  status: r.status ?? null,
  amount: r.amount,
  payment_intent: typeof r.payment_intent === "string" ? r.payment_intent : r.payment_intent?.id ?? null,
  failure_reason: r.failure_reason ?? null,
  metadata: r.metadata ?? null,
});
const notFound = (e: any) => e?.statusCode === 404 || e?.code === "resource_missing" || e?.raw?.code === "resource_missing";

const stripe: RefundApi = {
  async createRefund(env: Env, params, key) {
    return toRefund(await createStripeClient(env).refunds.create(params, { idempotencyKey: key }));
  },
  async retrieveRefund(env, id) {
    try {
      return toRefund(await createStripeClient(env).refunds.retrieve(id));
    } catch (e) {
      if (notFound(e)) return null;
      throw e;
    }
  },
  async listRefunds(env, pi) {
    const res = await createStripeClient(env).refunds.list({ payment_intent: pi, limit: 100 });
    return res.data.map(toRefund);
  },
  async retrievePaymentIntent(env, id) {
    try {
      const pi = await createStripeClient(env).paymentIntents.retrieve(id);
      return { id: pi.id, amount_received: pi.amount_received, status: pi.status, currency: pi.currency };
    } catch (e) {
      if (notFound(e)) return null;
      throw e;
    }
  },
};

export function productionDeps(): Deps {
  return { store, stripe };
}
