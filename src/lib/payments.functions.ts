import { createServerFn } from "@tanstack/react-start";
import type Stripe from "stripe";
import { requireActiveAccount } from "@/lib/active-account";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";

import {
  getPlanById,
  planLabelWithClass,
  vehicleClassFromName,
  isVehicleClass,
  KM_TARIFF_CENTS_PER_KM,
  KM_TARIFF_MIN_EUR,
  VEHICLE_CLASS_SHORT_LABEL,
  type VehicleClass,
  KM_CATALOG_VERSION,
  checkoutKmCatalogError,
} from "@/lib/booking-rules";
import { getAddonById, resolveAddonSelection } from "@/lib/addons";
import { CUSTOM_KM_MAX, paidCustomKmCents } from "@/lib/custom-km";

const DEPOSIT_CENTS = 200_00;

type CheckoutSessionResult = { clientSecret: string } | { error: string };

function assertStripeEnvironment(environment: StripeEnv) {
  if (environment !== "sandbox" && environment !== "live") {
    throw new Error("Ungültige Stripe-Umgebung");
  }
}

const REQUIRED_DOC_TYPES = ["id_front", "id_back", "license_front", "license_back"] as const;

export const createBookingCheckout = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((data: {
    plan: string;
    customerEmail?: string;
    userId?: string;
    returnUrl: string;
    environment: StripeEnv;
    addonIds?: string[];
    vehiclePlate?: string | null;
    vehicleName?: string | null;
    vehicleClass?: VehicleClass;
    startDate?: string;
    startHour?: number;
    /** Optionaler persönlicher Gutscheincode (z. B. Geburtstagsvorteil). */
    couponCode?: string | null;
    /** Im Browser angezeigte Kilometer-Katalogversion (nur Konsistenzprüfung). */
    kmCatalog?: string;
    /** Optionales individuelles Kilometerpaket: gewünschte GESAMT-km (sonst null). */
    customKm?: number | null;
    reviewConsent?: boolean;
  }) => {
    if (data.reviewConsent !== undefined && typeof data.reviewConsent !== "boolean") throw new Error("Ungültige Einwilligung");
    if (data.customKm != null && (!Number.isSafeInteger(data.customKm) || data.customKm < 0 || data.customKm > CUSTOM_KM_MAX)) {
      throw new Error("Ungültige Kilometerangabe");
    }
    const planId = data.plan.startsWith("rent_") ? data.plan.slice(5) : data.plan;
    const plan = getPlanById(planId);
    if (!plan && planId !== "km") throw new Error("Invalid plan");
    if (!data.returnUrl) throw new Error("returnUrl fehlt");
    assertStripeEnvironment(data.environment);
    if (data.addonIds) {
      if (!Array.isArray(data.addonIds) || data.addonIds.length > 5) {
        throw new Error("Ungültige Zusatzpakete");
      }
      for (const id of data.addonIds) {
        if (typeof id !== "string" || !getAddonById(id)) {
          throw new Error(`Unbekanntes Zusatzpaket: ${id}`);
        }
      }
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<CheckoutSessionResult> => {
    const { runBookingCheckout } = await import("@/lib/booking-checkout.server");
    return runBookingCheckout(data, context);
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

/**
 * Sucht die Buchung, die vom Stripe-Webhook für eine Checkout-Session angelegt
 * wurde. Wird von /checkout/return zum Polling verwendet, damit die Seite
 * unabhängig von LocalStorage funktioniert.
 */
export const getBookingBySessionId = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; environment: StripeEnv }) => {
    if (!data.sessionId) throw new Error("sessionId fehlt");
    assertStripeEnvironment(data.environment);
    return data;
  })
  .handler(async ({ data }): Promise<{
    bookingId: string | null;
    paymentStatus: string | null;
    /** Serverseitig bestätigte Zahlung – Basis für Conversion-Tracking */
    paid: boolean;
    /** Echter Umsatz (Miete + Add-ons) OHNE rückzahlbare Kaution, in EUR */
    conversionValueEur: number | null;
    currency: string;
    /** Bevorzugt Stripe PaymentIntent, sonst Checkout-Session-ID */
    transactionId: string | null;
  }> => {
    const stripe = createStripeClient(data.environment);
    const session = await stripe.checkout.sessions.retrieve(data.sessionId, {
      expand: ["payment_intent"],
    });
    const pi = session.payment_intent as Stripe.PaymentIntent | null;
    const paymentIntentId = pi?.id ?? null;
    const paymentStatus = session.payment_status ?? null;
    const empty = {
      bookingId: null,
      paymentStatus,
      paid: false,
      conversionValueEur: null,
      currency: "EUR",
      transactionId: null,
    };
    if (!paymentIntentId) return empty;

    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("id, status, plan_price, addons_total_cents")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (!booking) return { ...empty, transactionId: paymentIntentId };

    // Zahlung gilt nur als bestätigt, wenn Stripe "paid" meldet UND der Webhook
    // die Buchung mit bezahltem Status persistiert hat.
    const paid = paymentStatus === "paid" && booking.status !== "pending";
    const rentEur = Number(booking.plan_price ?? 0);
    const addonsEur = Number(booking.addons_total_cents ?? 0) / 100;
    const valueEur = Math.round((rentEur + addonsEur) * 100) / 100;

    return {
      bookingId: booking.id as string,
      paymentStatus,
      paid,
      // Kaution (200 €) ist reine rückzahlbare Sicherheitsleistung und
      // deshalb NICHT Teil des Conversion-Werts.
      conversionValueEur: paid && valueEur > 0 ? valueEur : null,
      currency: "EUR",
      transactionId: paymentIntentId ?? data.sessionId,
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
  .middleware([requireActiveAccount])
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

/**
 * Kautionsabrechnung über den robusten Auftrag (deposit-settlement.server.ts):
 * Umgebung aus der Originalzahlung, stabiler Idempotenz-Key, Buchungslock.
 * Die Client-Umgebung wird ignoriert. Bevorzugt: Admin-Bereich „Offene Kautionen“.
 */
export const settleDeposit = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((data: { bookingId: string; deductCents: number; environment?: StripeEnv }) => {
    if (!data.bookingId) throw new Error("bookingId fehlt");
    if (!Number.isSafeInteger(data.deductCents) || data.deductCents < 0 || data.deductCents > 5_000_00) throw new Error("Abzug ungültig");
    return { bookingId: data.bookingId, deductCents: data.deductCents };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { requestDepositSettlement } = await import("@/lib/deposit-settlement.server");
    const { productionDeps } = await import("@/lib/deposit-settlement-deps.server");
    const { settlement } = await requestDepositSettlement(productionDeps(), {
      bookingId: data.bookingId, deductCents: data.deductCents, adminId: context.userId, requestKey: `admin-${data.bookingId}-${data.deductCents}`,
    });
    return { refundCents: settlement.refund_cents, refundId: settlement.refund_id, status: settlement.status };
  });

export const cancelBookingWithRefund = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((data: { bookingId: string; environment?: StripeEnv }) => {
    if (!data.bookingId) throw new Error("bookingId fehlt");
    return { bookingId: data.bookingId };
  })
  .handler(async ({ data, context }) => {
    const { requestCancellation } = await import("@/lib/deposit-settlement.server");
    const { productionDeps } = await import("@/lib/deposit-settlement-deps.server");
    let res;
    try {
      res = await requestCancellation(productionDeps(), { bookingId: data.bookingId, userId: context.userId, requestKey: `cancel-${data.bookingId}` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("DEPOSIT_ALREADY_REVIEWED")) throw new Error("Die Kaution dieser Buchung wurde bereits abgerechnet; Stornierung bitte mit uns klären.");
      throw e;
    }
    // Storno im Kalender: Sofortversuch nur für diese Buchung, Fehler bleiben retrybar.
    try {
      const { kickCalendarSync } = await import("@/lib/calendar-sync.server");
      await kickCalendarSync("booking", data.bookingId);
    } catch (e) {
      console.warn("[storno] Kalenderübertragung nicht gestartet", e);
    }
    return { refundCents: res.settlement.refund_cents, feeCents: res.feeCents, hours: res.hours, refundId: res.settlement.refund_id, status: res.settlement.status };
  });
