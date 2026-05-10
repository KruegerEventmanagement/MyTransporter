import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id: sessionId } = Route.useSearch();

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
          <Check className="w-10 h-10 text-foreground" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Zahlung erfolgreich</h1>
        <p className="text-muted-foreground mb-8">
          {sessionId
            ? "Deine Buchung ist bestätigt. Du erhältst gleich deinen Abholcode."
            : "Wir konnten keine Sitzungs-Information finden."}
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3 text-accent-foreground font-medium transition-all hover:scale-[1.02]"
        >
          Zur Buchung
        </Link>
      </div>
    </main>
  );
}