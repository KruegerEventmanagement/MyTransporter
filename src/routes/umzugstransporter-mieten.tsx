import { createFileRoute, Link } from "@tanstack/react-router";
import { AdRails } from "@/components/ads/AdRails";
import { InFlowAd } from "@/components/ads/InFlowAd";
import { Navbar } from "@/components/Navbar";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { DEPOSIT_EUR, L4H2_SURCHARGE_PER_DAY_EUR, PLAN_CATALOG } from "@/lib/booking-rules";
import { ORG_ID, SITE_URL, pageHead, type Crumb } from "@/lib/seo";

const PATH = "/umzugstransporter-mieten";
const CRUMBS: Crumb[] = [
  { name: "Start", path: "/" },
  { name: "Umzugstransporter mieten", path: PATH },
];
const byId = (id: string) => PLAN_CATALOG.find((p) => p.id === id)!;
const P3 = byId("3h");
const P6 = byId("6h");
const P24 = byId("24h_300");
const P3D = byId("multi_3d");

export const Route = createFileRoute("/umzugstransporter-mieten")({
  head: () =>
    pageHead({
      path: PATH,
      title: "Umzugstransporter mieten: kurz oder lang? Ratgeber | MyTransporter Leonberg",
      description:
        "Welcher Transporter passt zu deinem Umzug oder Möbeltransport? Fahrzeuggröße wählen, Mietdauer planen, Türbreite messen, sicher laden und online in Leonberg buchen.",
      ogType: "article",
      breadcrumbs: CRUMBS,
      schema: [
        {
          "@type": "Service",
          "@id": `${SITE_URL}${PATH}#service`,
          name: "Umzugstransporter mieten",
          serviceType: "Transportervermietung für Umzug und Möbeltransport",
          provider: { "@id": ORG_ID },
          areaServed: ["Leonberg", "Stuttgart", "Böblingen", "Sindelfingen"],
        },
      ],
    }),
  component: UmzugstransporterPage,
});

function UmzugstransporterPage() {
  return (
    <main className="min-h-screen bg-background pt-12">
      <Navbar />
      <AdRails>
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <Breadcrumbs items={CRUMBS} />
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Umzugstransporter mieten – so wählst du richtig</h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          Ob kompletter Umzug oder nur ein Sofa aus einer Kleinanzeige: Die richtige Fahrzeuggröße
          und eine realistische Mietdauer sparen Geld und Nerven. Hier findest du die wichtigsten
          Punkte, bevor du deinen Transporter in Leonberg buchst.
        </p>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-foreground">Kurzer oder langer Transporter?</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Der <strong className="text-foreground">kurze L1H1</strong> ist wendig, passt in normale
            Parklücken und reicht für einzelne Möbelstücke, Baumarkt-Einkäufe oder die
            Kleinanzeigen-Abholung. Der <strong className="text-foreground">lange L4H2 mit Hochdach</strong>{" "}
            bietet deutlich mehr Laderaum und Stehhöhe – sinnvoll, wenn eine ganze Wohnung oder
            hohe Schränke transportiert werden. Er kostet {L4H2_SURCHARGE_PER_DAY_EUR} € pro Miettag
            mehr. Für besonders lange Ladung gibt es zusätzlich einen VW Crafter mit Abholung in{" "}
            <Link to="/transporter-mieten-pforzheim-calw" className="underline text-foreground">Engelsbrand-Grunbach</Link>.
          </p>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Faustregel: Lieber eine Größe mehr als zwei Fahrten. Die genauen Laderaummaße jedes
            Fahrzeugs siehst du bei der Fahrzeugauswahl in der Buchung.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-foreground">Mietdauer planen</h2>
          <ul className="mt-3 list-disc pl-5 space-y-2 text-muted-foreground">
            <li>{P3.label} ({P3.price} €, {P3.freeKm} km): eine Abholung in der Nähe, zum Beispiel Möbelhaus oder Kleinanzeige.</li>
            <li>{P6.label} ({P6.price} €, {P6.freeKm} km): kleiner Umzug oder mehrere Fahrten an einem Vormittag.</li>
            <li>{P24.label} ({P24.price} €, {P24.freeKm} km): kompletter Umzugstag ohne Zeitdruck.</li>
            <li>{P3D.label} ({P3D.price} €): Abbau, Transport und Aufbau verteilt auf mehrere Tage.</li>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            Preise für den kurzen L1H1. Plane Pausen, Treppenhaus und Rückweg mit ein – eine zu
            knappe Buchung wird schnell stressig. Für längere Zeiträume lohnt sich die{" "}
            <Link to="/langzeitmiete" className="underline text-foreground">Langzeitmiete</Link>. Alle
            Tarife: <Link to="/preise" className="underline text-foreground">Preise</Link>.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-foreground">Vorher messen: die engste Stelle zählt</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Entscheidend ist nicht nur der Laderaum, sondern die schmalste Stelle auf dem Weg: Haus-
            und Wohnungstür, Treppenhaus, Aufzug und die Laderaumöffnung des Transporters. Miss
            Breite und Höhe der engsten Tür und vergleiche sie mit den größten Möbelstücken. Große
            Schränke lassen sich oft nur zerlegt transportieren.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-foreground">Sicher laden</h2>
          <ul className="mt-3 list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Schwere Teile nach unten und nah an die Trennwand zur Fahrerkabine.</li>
            <li>Ladung mit Spanngurten sichern, Lücken mit Decken oder Kartons füllen.</li>
            <li>Empfindliche Möbel mit Decken schützen; ein Umzugspaket kann in der Buchung dazugebucht werden.</li>
            <li>Das zulässige Gesamtgewicht nicht überschreiten – im Zweifel lieber zweimal fahren.</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-foreground">So läuft die Buchung</h2>
          <ol className="mt-3 list-decimal pl-5 space-y-2 text-muted-foreground">
            <li>Datum und Uhrzeit wählen, Tarif aussuchen.</li>
            <li>Freies Fahrzeug auswählen – Größe, Maße und Abholort werden angezeigt.</li>
            <li>Mit Führerschein und Ausweis verifizieren und online bezahlen.</li>
            <li>Schlüssel abholen, Fahrzeug fotografieren, losfahren.</li>
            <li>Vollgetankt und besenrein zurückgeben; die Kaution von {DEPOSIT_EUR} € wird danach erstattet.</li>
          </ol>
          <Link
            to="/"
            hash="booking"
            className="mt-6 inline-block rounded-full bg-foreground text-background px-8 py-3 font-semibold hover:opacity-90"
          >
            Verfügbarkeit prüfen
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            Noch Fragen? Schau in die <Link to="/faq" className="underline text-foreground">FAQ</Link> oder{" "}
            <Link to="/kontakt" className="underline text-foreground">melde dich direkt</Link>.
          </p>
        </section>

        <RelatedLinks exclude={PATH} />
      </article>
      </AdRails>
    </main>
  );
}
