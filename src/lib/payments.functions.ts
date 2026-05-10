import { createServerFn } from "@tanstack/react-start";
import Stripe from "stripe";

type PlanKey = "rent_6h" | "rent_24h" | "rent_km";

const PLAN_PRICING: Record<PlanKey, { rent: number; label: string }> = {
  rent_6h: { rent: 100_00, label: "Transporter-Miete · 6 Stunden" },
  rent_24h: { rent: 150_00, label: "Transporter-Miete · 24 Stunden" },
  rent_km: { rent: 0, label: "Transporter-Miete · Nur Kilometer (0,90 €/km)" },
};
const DEPOSIT_CENTS = 200_00;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY ist nicht konfiguriert");
  return new Stripe(key, {
    apiVersion: "2026-03-25.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export const createBookingCheckout = createServerFn({ method: "POST" })
  .inputValidator((data: {
    plan: PlanKey;
    customerEmail?: string;
    userId?: string;
    successUrl: string;
    cancelUrl: string;
  }) => {
    if (!["rent_6h", "rent_24h", "rent_km"].includes(data.plan)) {
      throw new Error("Invalid plan");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const stripe = getStripe();
    const plan = PLAN_PRICING[data.plan];

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
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
      line_items,
      success_url: data.successUrl,
      cancel_url: data.cancelUrl,
      ...(data.customerEmail && { customer_email: data.customerEmail }),
      ...(data.userId && { metadata: { userId: data.userId, plan: data.plan } }),
    });

    if (!session.url) throw new Error("Stripe hat keine Checkout-URL zurückgegeben");
    return session.url;
  });
