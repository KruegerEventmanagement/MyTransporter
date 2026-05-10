import { createServerFn } from "@tanstack/react-start";
import { type StripeEnv, createStripeClient } from "@/lib/stripe.server";

type PlanKey = "rent_6h" | "rent_24h" | "rent_km";

const PLAN_TO_PRICE: Record<PlanKey, string | null> = {
  rent_6h: "rent_6h_price",
  rent_24h: "rent_24h_price",
  rent_km: "rent_km_prepay_price",
};

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
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
    return data;
  })
  .handler(async ({ data }) => {
    const stripe = createStripeClient(data.environment);

    const rentLookup = PLAN_TO_PRICE[data.plan];
    const lookupKeys = [rentLookup!, "deposit_price"];
    const prices = await stripe.prices.list({ lookup_keys: lookupKeys });
    const rentPrice = prices.data.find((p) => p.lookup_key === rentLookup);
    const depositPrice = prices.data.find((p) => p.lookup_key === "deposit_price");
    if (!rentPrice || !depositPrice) throw new Error("Price not found");

    const customerId = (data.customerEmail || data.userId)
      ? await resolveOrCreateCustomer(stripe, {
          email: data.customerEmail,
          userId: data.userId,
        })
      : undefined;

    const session = await stripe.checkout.sessions.create({
      line_items: [
        { price: rentPrice.id, quantity: 1 },
        { price: depositPrice.id, quantity: 1 },
      ],
      mode: "payment",
      ui_mode: "embedded_page",
      return_url: data.returnUrl,
      ...(customerId && { customer: customerId }),
      ...(data.userId && {
        metadata: { userId: data.userId, plan: data.plan },
      }),
    });

    return session.client_secret;
  });