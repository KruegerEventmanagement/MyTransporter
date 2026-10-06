import { createFileRoute, Link } from "@tanstack/react-router";
import { AdRails } from "@/components/ads/AdRails";
import { InFlowAd } from "@/components/ads/InFlowAd";
import { Navbar } from "@/components/Navbar";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { DEPOSIT_EUR, planCatalog } from "@/lib/booking-rules";
import { BUSINESS, GRUNBACH_PLACE_ID, ORG_ID, SITE_URL, pageHead, type Crumb } from "@/lib/seo";

const PATH = "/transporter-mieten-pforzheim-calw";
const CRUMBS: Crumb[] = [
  { name: "Start", path: "/" },
  { name: "Transporter mieten Pforzheim & Calw", path: PATH },
];
const CRAFTER = planCatalog("l5h2");
const CRAFTER_24 = CRAFTER.find((p) => p.id === "24h_300")!;
const CRAFTER_WEEK = CRAFTER.find((p) => p.id === "multi_7d")!;
const G = BUSINESS.grunbach;

export const Route = createFileRoute("/transporter-mieten-pforzheim-calw")({
  head: () =>
    pageHead({
      path: PATH,
      title: "Transporter mieten für Pforzheim & Calw – Abholung in Engelsbrand-Grunbach | MyTransporter",
      description: `Extra langer VW Crafter (L5H2) zur Miete mit persönlicher Schlüsselübergabe in der ${G.street}, ${G.postalCode} ${G.locality} – nah an Pforzheim und Calw. 24 Stunden ${CRAFTER_24.price} €.`,
      breadcrumbs: CRUMBS,
      schema: [
        {
          "@type": "Service",
          "@id": `${SITE_URL}${PATH}#service`,
          name: "Transporter-Vermietung VW Crafter, Abholung Engelsbrand-Grunbach",
          serviceType: "Transportervermietung",
          provider: { "@id": ORG_ID },
          areaServed: ["Pforzheim", "Calw", "Engelsbrand"],
          availableChannel: {
            "@type": "ServiceChannel",
            serviceLocation: {
              "@type": "Place",
              "@id": GRUNBACH_PLACE_ID,
              name: "Abholort Engelsbrand-Grunbach",
              address: {
                "@type": "PostalAddress",
                streetAddress: G.street,
                postalCode: G.postalCode,
                addressLocality: G.locality,
                addressRegion: "BW",
                addressCountry: "DE",
              },
            },
          },
          offers: [
            { "@type": "Offer", name: `${CRAFTER_24.label} (L5H2)`, price: CRAFTER_24.price, priceCurrency: "EUR" },
            { "@type": "Offer", name: `${CRAFTER_WEEK.label} (L5H2)`, price: CRAFTER_WEEK.price, priceCurrency: "EUR" },
          ],
        },
      ],
    }),
  component: PforzheimCalwPage,
});

function PforzheimCalwPage() {
  return (
    <main className="min-h-screen bg-background pt-12">
      <Navbar />
      <AdRails>
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <Breadcrumbs items={CRUMBS} />
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
          Transporter mieten für Pforzheim und Calw
        </h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          Neben unserem Hauptstandort in Leonberg gibt es einen zweiten, echten Abholort in
          Engelsbrand-Grunbach. Dort steht ein extra langer VW Crafter (Klasse L5H2) bereit. Für
          Kunden aus Pforzheim, Calw und den umliegenden Orten ist das oft der kürzere Weg zum
          Transporter. In Pforzheim oder Calw selbst haben wir keinen Standort – abgeholt und
          zurückgegeben wird ausschließlich in Grunbach.
        </p>

        <section className="mt-8 rounded-2xl border border-border p-6">
          <h2 className="text-xl font-bold text-foreground">Abholort Engelsbrand-Grunbach</h2>
          <address className="not-italic mt-3 text-foreground">
            {G.street}
            <br />
            {G.postalCode} {G.locality}
          </address>
          <dl className="mt-4 grid gap-2 text-sm">
            <div><dt className="inline font-medium text-foreground">Fahrzeug: </dt><dd className="inline text-muted-foreground">VW Crafter, extra lang (L5H2)</dd></div>
            <div><dt className="inline font-medium text-foreground">Übergabe: </dt><dd className="inline text-muted-foreground">persönliche Schlüsselübergabe, keine Schlüsselbox</dd></div>
            <div><dt className="inline font-medium text-foreground">Übergabezeit: </dt><dd className="inline text-muted-foreground">wie bei der Buchung gewählt; bei Fragen vorher anrufen</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={G.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border-2 border-foreground px-5 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
            >
              Route in Google Maps
            </a>
            <a href={`tel:${BUSINESS.phone}`} className="rounded-full border border-border px-5 py-2 text-sm text-foreground hover:bg-secondary">
              {BUSINESS.phoneDisplay}
            </a>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-foreground">Wofür eignet sich der Crafter?</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Der Crafter ist unser längstes Fahrzeug. Er passt, wenn beim Umzug viele Möbel auf
            einmal mitsollen, wenn lange Teile wie Küchenarbeitsplatten, Schränke oder Latten
            transportiert werden oder wenn du die Zahl der Fahrten möglichst klein halten willst.
            Für eine einzelne Kommode aus einer Kleinanzeige ist oft der kurze L1H1 in Leonberg die
            günstigere Wahl. Hilfe bei der Auswahl findest du im Ratgeber{" "}
            <Link to="/umzugstransporter-mieten" className="underline text-foreground">Umzugstransporter mieten</Link>.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-foreground">Preise für den Crafter</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Der Crafter hat eigene Tarife, die über denen der kleineren Fahrzeuge liegen. Beispiele:
            {" "}{CRAFTER_24.label} ({CRAFTER_24.freeKm} km inklusive) {CRAFTER_24.price} €,{" "}
            {CRAFTER_WEEK.label} ({CRAFTER_WEEK.freeKm.toLocaleString("de-DE")} km inklusive){" "}
            {CRAFTER_WEEK.price} €. Dazu kommt eine Kaution von {DEPOSIT_EUR} €, die nach
            ordnungsgemäßer Rückgabe erstattet wird. Alle Tarife und Mehrkilometer stehen auf der{" "}
            <Link to="/preise" className="underline text-foreground">Preisseite</Link>; der
            verbindliche Preis wird dir in der Buchung angezeigt, bevor du bezahlst.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-foreground">So buchst du den Crafter in Grunbach</h2>
          <ol className="mt-3 list-decimal pl-5 space-y-2 text-muted-foreground">
            <li>Auf der Startseite Datum und Uhrzeit wählen.</li>
            <li>Tarif auswählen; im Fahrzeugschritt wird der Crafter mit Abholort Grunbach angezeigt, wenn er im Zeitraum frei ist.</li>
            <li>Mit Führerschein und Ausweis verifizieren und online bezahlen.</li>
            <li>Zur gebuchten Zeit nach Grunbach kommen – der Schlüssel wird persönlich übergeben.</li>
            <li>Rückgabe vollgetankt und besenrein am selben Ort.</li>
          </ol>
          <p className="mt-3 text-sm text-muted-foreground">
            Verfügbarkeit ist nicht garantiert – sie wird für genau deinen Zeitraum live geprüft.
          </p>
          <Link
            to="/"
            hash="booking"
            className="mt-6 inline-block rounded-full bg-foreground text-background px-8 py-3 font-semibold hover:opacity-90"
          >
            Verfügbarkeit prüfen
          </Link>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-foreground">Lieber in Leonberg abholen?</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Die kurzen und langen Transporter (L1H1 und L4H2) werden in Leonberg übergeben. Das
            ist vor allem aus Richtung Stuttgart, Böblingen und Sindelfingen praktisch. Adresse und
            Kontakt stehen auf der <Link to="/kontakt" className="underline text-foreground">Kontaktseite</Link>.
          </p>
        </section>

        <RelatedLinks exclude={PATH} />
      </article>
      </AdRails>
    </main>
  );
}
