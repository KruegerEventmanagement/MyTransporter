import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { privateHead } from "@/lib/seo";
import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { getBookingBySessionId } from "@/lib/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { trackPurchase } from "@/lib/analytics";
import { BrandHomeLink } from "@/components/BrandHomeLink";

export const Route = createFileRoute("/checkout/return")({
  head: () => privateHead("Zahlung wird bestätigt, MyTransporter"),
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id: sessionId } = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setError("Keine Sitzungs-Information gefunden.");
      return;
    }

    let cancelled = false;
    const environment = getStripeEnvironment();
    // Server anpingen, bis der Stripe-Webhook die Buchung angelegt hat.
    // Max ~30 s (20 Versuche × 1,5 s). Falls das durchläuft, ohne dass die
    // Buchung erscheint, hat der Webhook noch nicht gefeuert — wir geben eine
    // beruhigende Meldung aus; die Buchung wird trotzdem angelegt.
    const poll = async () => {
      setWaiting(true);
      for (let attempt = 0; attempt < 20; attempt++) {
        if (cancelled) return;
        try {
          const result = await getBookingBySessionId({ data: { sessionId, environment } });
          if (result.paid && result.conversionValueEur && result.transactionId) {
            // Nur serverseitig verifizierte Werte; feuert genau einmal pro transaction_id
            // und nur bei Marketing-Einwilligung + gesetztem Conversion-Label.
            trackPurchase({
              paid: true,
              conversionValueEur: result.conversionValueEur,
              currency: result.currency,
              transactionId: result.transactionId,
            });
          }
          if (result.bookingId) {
            try { localStorage.removeItem("mt_pending_booking"); } catch {}
            if (!cancelled) {
              navigate({ to: "/trip/$bookingId", params: { bookingId: result.bookingId }, replace: true });
            }
            return;
          }
        } catch (e) {
          console.warn("Buchung wird noch verarbeitet…", e);
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelled) {
        setError(
          "Deine Zahlung war erfolgreich. Die Buchung wird gerade angelegt — du erhältst gleich eine Bestätigungs-E-Mail. Falls du nach ein paar Minuten nichts siehst, melde dich bitte unter info@mytransporter.org.",
        );
        setWaiting(false);
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId, navigate]);

  return (
    <main className="relative min-h-screen bg-background flex items-center justify-center px-4">
      <BrandHomeLink className="absolute left-4 top-3" imageClassName="h-7 w-auto" />
      <div className="max-w-md w-full text-center">
        {error ? (
          <>
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-foreground" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Hoppla</h1>
            <p className="text-muted-foreground mb-8">{error}</p>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3 text-accent-foreground font-medium transition-all hover:scale-[1.02]"
            >
              Zur Buchung
            </a>
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-10 h-10 text-foreground animate-spin" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Zahlung erfolgreich</h1>
            <p className="text-muted-foreground">
              {waiting
                ? "Deine Buchung wird gerade angelegt, einen Moment bitte…"
                : "Deine Buchung wird vorbereitet, einen Moment bitte…"}
            </p>
          </>
        )}
      </div>
    </main>
  );
}