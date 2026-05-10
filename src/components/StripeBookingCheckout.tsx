import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createBookingCheckout } from "@/lib/payments.functions";

interface Props {
  plan: "rent_6h" | "rent_24h" | "rent_km";
  customerEmail?: string;
  userId?: string;
  returnUrl: string;
}

export function StripeBookingCheckout({ plan, customerEmail, userId, returnUrl }: Props) {
  const fetchClientSecret = async (): Promise<string> => {
    const secret = await createBookingCheckout({
      data: { plan, customerEmail, userId, returnUrl, environment: getStripeEnvironment() },
    });
    if (!secret) throw new Error("Checkout-Session konnte nicht erstellt werden");
    return secret;
  };

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}