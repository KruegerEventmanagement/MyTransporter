import { Link } from "@tanstack/react-router";
import { PLAN_CATALOG } from "@/lib/booking-rules";

const MIN_PRICE = Math.min(...PLAN_CATALOG.map((p) => p.price));

/** Kurze, echte Angebotsbeschreibung über der Buchung – mit crawlbaren Hilfelinks. */
export function HomeOfferSummary() {
  return (
    <section aria-label="Was MyTransporter bietet" className="px-4 pb-4">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Transporter online mieten – stundenweise, tageweise oder für eine Woche, ab {MIN_PRICE} €. Du wählst
          Fahrzeug und Zeitraum, verifizierst dich digital und holst den Transporter am angegebenen Abholort ab.
        </p>
        <nav aria-label="Hilfe zur Miete" className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
          <Link to="/preise" className="text-foreground underline underline-offset-2">Preise</Link>
          <Link to="/mietratgeber" className="text-foreground underline underline-offset-2">Mietratgeber</Link>
          <Link to="/faq" className="text-foreground underline underline-offset-2">FAQ</Link>
          <Link to="/kontakt" className="text-foreground underline underline-offset-2">Kontakt</Link>
        </nav>
      </div>
    </section>
  );
}
