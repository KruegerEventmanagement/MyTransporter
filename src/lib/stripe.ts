import { loadStripe, Stripe } from "@stripe/stripe-js";

type StripeEnv = 'sandbox' | 'live';

const SANDBOX_CLIENT_TOKEN = "pk_test_51TU4p2K5xtKf62Z9RYXeuPTslUu65hQioNLN9ZzXewWuBlJ2P7Aouv8Pz19BUT2wHgDnJJ5mX77W3glyrpaf3JQP00SCHFuN0I";
const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN || SANDBOX_CLIENT_TOKEN;
const environment: StripeEnv = clientToken?.startsWith('pk_test_') ? 'sandbox' : 'live';

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    if (!clientToken) {
      throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is not set");
    }
    stripePromise = loadStripe(clientToken);
  }
  return stripePromise;
}

export function getStripeEnvironment(): StripeEnv {
  return environment;
}