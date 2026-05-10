const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;

export function PaymentTestModeBanner() {
  if (!clientToken?.startsWith("pk_test_")) return null;

  return (
    <div className="w-full bg-secondary border-b border-border px-4 py-2 text-center text-sm text-foreground">
      Alle Zahlungen in der Vorschau laufen im Test-Modus.{" "}
      <a
        href="https://docs.lovable.dev/features/payments#test-and-live-environments"
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-medium"
      >
        Mehr erfahren
      </a>
    </div>
  );
}