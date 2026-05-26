import { createServerFn } from "@tanstack/react-start";
import type Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";

type PlanKey = "rent_6h" | "rent_24h" | "rent_km";

const PLAN_PRICING: Record<PlanKey, { rent: number; label: string }> = {
  rent_6h: { rent: 100_00, label: "Transporter-Miete · 6 Stunden" },
  rent_24h: { rent: 150_00, label: "Transporter-Miete · 24 Stunden" },
  rent_km: { rent: 0, label: "Transporter-Miete · Nur Kilometer (0,90 €/km)" },
};
const DEPOSIT_CENTS = 200_00;

type CheckoutSessionResult = { clientSecret: string } | { error: string };

function assertStripeEnvironment(environment: StripeEnv) {
  if (environment !== "sandbox" && environment !== "live") {
    throw new Error("Ungültige Stripe-Umgebung");
  }
}

export const createBookingCheckout = createServerFn({ method: "POST" })
  .inputValidator((data: {
    plan: PlanKey;
    customerEmail?: string;
    userId?: string;
    returnUrl: string;
    environment: StripeEnv;
  }) => {
    if (!["rent_6h", "rent_24h", "rent_km"].includes(data.plan)) {
      throw new Error("Invalid plan");
    }
    if (!data.returnUrl) throw new Error("returnUrl fehlt");
    assertStripeEnvironment(data.environment);
    return data;
  })
  .handler(async ({ data }): Promise<CheckoutSessionResult> => {
    try {
      const stripe = createStripeClient(data.environment);
      const plan = PLAN_PRICING[data.plan];

    const line_items: Array<{
      price_data: {
        currency: string;
        product_data: { name: string };
        unit_amount: number;
      };
      quantity: number;
    }> = [];
    if (plan.rent > 0) {
      line_items.push({
        price_data: {
          currency: "eur",
          product_data: { name: plan.label },
          unit_amount: plan.rent,
        },
        quantity: 1,
      });
    }
    line_items.push({
      price_data: {
        currency: "eur",
        product_data: { name: "Kaution (wird nach Rückgabe erstattet)" },
        unit_amount: DEPOSIT_CENTS,
      },
      quantity: 1,
    });

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ui_mode: "embedded_page",
        line_items,
        return_url: data.returnUrl,
        customer_creation: "always",
        ...(data.customerEmail && { customer_email: data.customerEmail }),
        payment_intent_data: {
          description: plan.rent > 0 ? `${plan.label} + Kaution` : "Transporter-Miete · Kaution",
          setup_future_usage: "off_session",
        },
        ...(data.userId && { metadata: { userId: data.userId, plan: data.plan } }),
      });

      if (!session.client_secret) throw new Error("Stripe hat kein Checkout-Token zurückgegeben");
      return { clientSecret: session.client_secret };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/** Liest Customer / PaymentIntent / PaymentMethod aus einer abgeschlossenen Session. */
export const getCheckoutSessionDetails = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; environment: StripeEnv }) => {
    if (!data.sessionId) throw new Error("sessionId fehlt");
    assertStripeEnvironment(data.environment);
    return data;
  })
  .handler(async ({ data }) => {
    const stripe = createStripeClient(data.environment);
    const session = await stripe.checkout.sessions.retrieve(data.sessionId, {
      expand: ["payment_intent"],
    });
    const pi = session.payment_intent as Stripe.PaymentIntent | null;
    return {
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
      paymentIntentId: pi?.id ?? null,
      paymentMethodId: typeof pi?.payment_method === "string" ? pi.payment_method : pi?.payment_method?.id ?? null,
      paymentStatus: session.payment_status,
    };
  });

async function assertAdmin(supabase: {
  from: (t: string) => {
    select: (s: string) => {
      eq: (c: string, v: string) => {
        eq: (c: string, v: string) => {
          maybeSingle: () => Promise<{ data: unknown }>;
        };
      };
    };
  };
}, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Nicht autorisiert");
}

/** Bucht Mehrkilometer (oder beliebigen Restbetrag) off-session von der gespeicherten Karte ab. */
export const chargeBookingExtra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { bookingId: string; amountCents: number; description?: string; environment: StripeEnv }) => {
    if (!data.bookingId) throw new Error("bookingId fehlt");
    if (!Number.isInteger(data.amountCents) || data.amountCents < 50) {
      throw new Error("Betrag muss mindestens 0,50 € sein");
    }
    if (data.amountCents > 500_00) throw new Error("Betrag zu hoch (max. 500 €)");
    assertStripeEnvironment(data.environment);
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("stripe_customer_id, stripe_payment_method_id, extra_charge_status")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error || !booking) throw new Error("Buchung nicht gefunden");
    if (booking.extra_charge_status === "succeeded") {
      throw new Error("Mehrkilometer wurden bereits abgebucht");
    }
    if (!booking.stripe_customer_id || !booking.stripe_payment_method_id) {
      throw new Error("Keine gespeicherte Zahlungsmethode für diese Buchung");
    }
    const stripe = createStripeClient(data.environment);
    const intent = await stripe.paymentIntents.create({
      amount: data.amountCents,
      currency: "eur",
      customer: booking.stripe_customer_id,
      payment_method: booking.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      description: data.description ?? "Mehrkilometer / Zusatzkosten",
      metadata: { bookingId: data.bookingId, kind: "extra_km" },
    });
    await supabaseAdmin
      .from("bookings")
      .update({
        extra_charge_intent_id: intent.id,
        extra_charge_status: intent.status,
        extra_charge_cents: data.amountCents,
      })
      .eq("id", data.bookingId);
    return { status: intent.status, intentId: intent.id };
  });

/** Behält einen Teil der Kaution ein und erstattet den Rest. deductCents = einbehaltener Betrag. */
export const settleDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { bookingId: string; deductCents: number; environment: StripeEnv }) => {
    if (!data.bookingId) throw new Error("bookingId fehlt");
    if (!Number.isInteger(data.deductCents) || data.deductCents < 0) {
      throw new Error("Abzug ungültig");
    }
    if (data.deductCents > DEPOSIT_CENTS) {
      throw new Error("Abzug darf die Kaution (200 €) nicht übersteigen");
    }
    assertStripeEnvironment(data.environment);
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("stripe_payment_intent_id, deposit_status")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error || !booking) throw new Error("Buchung nicht gefunden");
    if (booking.deposit_status === "released") {
      throw new Error("Kaution wurde bereits abgerechnet");
    }
    if (!booking.stripe_payment_intent_id) {
      throw new Error("Keine Stripe-Zahlung für diese Buchung gefunden");
    }
    const refundCents = DEPOSIT_CENTS - data.deductCents;
    const stripe = createStripeClient(data.environment);
    let refundId: string | null = null;
    if (refundCents > 0) {
      const refund = await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
        amount: refundCents,
        metadata: { bookingId: data.bookingId, kind: "deposit_partial" },
      });
      refundId = refund.id;
    }
    await supabaseAdmin
      .from("bookings")
      .update({
        deposit_status: "released",
        deposit_released_at: new Date().toISOString(),
        deposit_released_by: context.userId,
        deposit_deducted_cents: data.deductCents,
        deposit_refund_id: refundId,
      })
      .eq("id", data.bookingId);
    return { refundCents, refundId };
  });

/**
 * Storniert eine Buchung des angemeldeten Nutzers, behält die fällige
 * Stornogebühr ein und erstattet den Rest (Miete - Gebühr) + Kaution
 * automatisch via Stripe-Refund auf den ursprünglichen PaymentIntent.
 *
 * Gebührenstaffel (h vor Abfahrt):
 *   ≥13 h: 0 €  ·  12 h: 1 €  ·  11 h: 2 €  ·  …  ·  1 h oder weniger: 12 €
 */
function computeCancellationFeeCents(startsAtMs: number, nowMs: number): { hours: number; feeCents: number } {
  const diffMs = startsAtMs - nowMs;
  const hours = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));
  let feeEuro: number;
  if (hours >= 13) feeEuro = 0;
  else if (hours <= 1) feeEuro = 12;
  else feeEuro = 13 - hours;
  return { hours, feeCents: feeEuro * 100 };
}

export const cancelBookingWithRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { bookingId: string; environment: StripeEnv }) => {
    if (!data.bookingId) throw new Error("bookingId fehlt");
    assertStripeEnvironment(data.environment);
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, user_id, status, start_date, start_hour, start_km, plan_price, deposit, deposit_status, stripe_payment_intent_id, remarks"
      )
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error || !booking) throw new Error("Buchung nicht gefunden");
    if (booking.user_id !== context.userId) throw new Error("Nicht autorisiert");
    if (booking.status === "cancelled") throw new Error("Buchung ist bereits storniert");
    if (booking.start_km !== null) throw new Error("Fahrt wurde bereits gestartet und kann nicht mehr storniert werden");
    if (!booking.stripe_payment_intent_id) throw new Error("Keine Stripe-Zahlung für diese Buchung gefunden");

    const startsAtMs = new Date(
      `${booking.start_date}T${String(booking.start_hour).padStart(2, "0")}:00:00`
    ).getTime();
    const { hours, feeCents } = computeCancellationFeeCents(startsAtMs, Date.now());

    const planPriceCents = Math.round(Number(booking.plan_price) * 100);
    const depositCents = Math.round(Number(booking.deposit) * 100);
    // Erstattet wird die Miete abzüglich Gebühr + die volle Kaution
    const rentRefundCents = Math.max(0, planPriceCents - feeCents);
    const refundCents = rentRefundCents + depositCents;

    const stripe = createStripeClient(data.environment);
    let refundId: string | null = null;
    if (refundCents > 0) {
      const refund = await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
        amount: refundCents,
        metadata: { bookingId: booking.id, kind: "cancellation", fee_cents: String(feeCents) },
      });
      refundId = refund.id;
    }

    const nowIso = new Date().toISOString();
    const note = `Storniert am ${new Date().toLocaleString("de-DE")} · Gebühr ${(feeCents / 100).toFixed(2)} € (${hours} h vor Abfahrt) · Erstattet ${(refundCents / 100).toFixed(2)} €`;
    await supabaseAdmin
      .from("bookings")
      .update({
        status: "cancelled",
        deposit_status: "released",
        deposit_released_at: nowIso,
        deposit_released_by: context.userId,
        deposit_deducted_cents: feeCents,
        deposit_refund_id: refundId,
        remarks: booking.remarks ? `${booking.remarks}\n${note}` : note,
      })
      .eq("id", booking.id);

    return { refundCents, feeCents, hours, refundId };
  });
