import { Link } from "@tanstack/react-router";
import logoImage from "@/assets/logo.png";
import { PLAN_CATALOG, L4H2_SURCHARGE_EUR, DEPOSIT_EUR } from "@/lib/booking-rules";

const ENTRY_IDS = ["3h", "6h", "24h_300"] as const;

const ENTRY_PLANS = ENTRY_IDS.map((id) => PLAN_CATALOG.find((p) => p.id === id)!).filter(Boolean);

const ENTRY_PRICE = Math.min(...PLAN_CATALOG.map((p) => p.price));

function goToBooking() {
  window.dispatchEvent(new CustomEvent("mt:go-to-booking-start"));
  document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function HeroSection() {
  return (
    <section className="pt-10 pb-6 px-4">
      <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
        <button
          type="button"
          onClick={goToBooking}
          aria-label="Zur Buchung, Datum und Uhrzeit auswählen"
          className="cursor-pointer bg-transparent border-0 p-0 transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground rounded-md"
        >
          <img
            src={logoImage}
            alt="MyTransporter Logo"
            className="w-64 md:w-80 mb-3"
            width={800}
            height={512}
          />
        </button>

        <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground leading-tight">
          Transporter mieten in Leonberg &amp; Stuttgart – ab {ENTRY_PRICE} €
        </p>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl">
          Festpreise ohne versteckte Kosten – für Umzug, Möbeltransport, Baumarkt und
          Kleinanzeigen-Abholung in Leonberg, Stuttgart, Böblingen und Sindelfingen.
          Online buchen in unter 2 Minuten.
        </p>

        {/* Einstiegstarife L1H1 */}
        <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-xl">
          {ENTRY_PLANS.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={goToBooking}
              className="rounded-2xl border-2 border-border bg-card px-2 py-3 text-center hover:border-foreground transition-colors"
            >
              <span className="block text-xs text-muted-foreground">{plan.shortLabel}</span>
              <span className="block text-xl sm:text-2xl font-bold text-foreground mt-0.5">
                {plan.price} €
              </span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">
                inkl. {plan.freeKm} km
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Preise für den kurzen L1H1 · langer L4H2 mit Hochdach jeweils + {L4H2_SURCHARGE_EUR} €
          · Kaution {DEPOSIT_EUR} € (wird zurückerstattet)
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={goToBooking}
            className="w-full sm:w-auto rounded-full bg-foreground text-background px-8 py-3.5 text-base font-semibold hover:opacity-90 transition"
          >
            Verfügbarkeit prüfen
          </button>
          <Link
            to="/preise"
            className="w-full sm:w-auto rounded-full border-2 border-foreground text-foreground px-8 py-3 text-base font-semibold text-center hover:bg-secondary transition"
          >
            Alle Tarife &amp; Preise
          </Link>
        </div>
        <a
          href="tel:+4915236230118"
          className="mt-3 text-sm text-muted-foreground underline hover:text-foreground transition-colors"
        >
          Fragen? Direkt anrufen: 0152 3623 0118
        </a>
      </div>
    </section>
  );
}
