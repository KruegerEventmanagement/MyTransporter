import { Link } from "@tanstack/react-router";
import {
  PLAN_CATALOG,
  DEPOSIT_EUR,
  L4H2_SURCHARGE_PER_DAY_EUR,
  planCatalog,
} from "@/lib/booking-rules";

const byId = (id: string) => PLAN_CATALOG.find((p) => p.id === id)!;
const P3 = byId("3h");
const P24 = byId("24h_300");
const WEEK = byId("multi_7d");
const CRAFTER_24 = planCatalog("l5h2").find((p) => p.id === "24h_300")!;

/** Kompakter, sichtbarer Einführungstext unterhalb der Buchung. */
export function HomeIntroSection() {
  return (
    <section className="px-4 sm:px-6 py-12 border-t border-border" aria-labelledby="home-intro">
      <div className="max-w-3xl mx-auto">
        <h1 id="home-intro" className="text-2xl sm:text-3xl font-bold text-foreground">
          Transporter mieten in Leonberg
        </h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          MyTransporter vermietet Transporter direkt in Leonberg – online gebucht, Schlüssel vor Ort
          in der Römerstraße 36. Viele unserer Kunden kommen aus Stuttgart, Böblingen oder
          Sindelfingen: Abholung und Rückgabe sind immer in Leonberg, nicht in Stuttgart.
          Typische Einsätze sind Umzug, Möbeltransport, Baumarkt-Einkauf und die Abholung von
          Kleinanzeigen.
        </p>
        <ul className="mt-5 grid gap-2 text-sm text-foreground sm:grid-cols-2">
          <li>Kurzmiete: {P3.label} {P3.price} €, {P24.label} {P24.price} € (L1H1)</li>
          <li>Langer L4H2 mit Hochdach: +{L4H2_SURCHARGE_PER_DAY_EUR} € pro Miettag</li>
          <li>Wochenmiete ab {WEEK.price} €, länger über die Langzeitmiete</li>
          <li>Kaution {DEPOSIT_EUR} €, Rückgabe vollgetankt</li>
        </ul>
        <p className="mt-5 text-muted-foreground leading-relaxed">
          Für Pforzheim und Calw gibt es zusätzlich einen extra langen VW Crafter mit persönlicher
          Schlüsselübergabe in Engelsbrand-Grunbach (24 Stunden {CRAFTER_24.price} €).
        </p>
        <nav aria-label="Mehr zur Transporter-Miete" className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link to="/preise" className="underline underline-offset-2 text-foreground">Alle Preise</Link>
          <Link to="/langzeitmiete" className="underline underline-offset-2 text-foreground">Langzeitmiete</Link>
          <Link to="/umzugstransporter-mieten" className="underline underline-offset-2 text-foreground">Umzugstransporter wählen</Link>
          <Link to="/transporter-mieten-pforzheim-calw" className="underline underline-offset-2 text-foreground">Pforzheim & Calw</Link>
          <Link to="/mietratgeber" className="underline underline-offset-2 text-foreground">Mietratgeber</Link>
          <Link to="/faq" className="underline underline-offset-2 text-foreground">FAQ</Link>
          <Link to="/kontakt" className="underline underline-offset-2 text-foreground">Kontakt</Link>
        </nav>
      </div>
    </section>
  );
}
