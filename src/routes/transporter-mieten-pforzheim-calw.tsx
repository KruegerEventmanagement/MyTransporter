import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { MapPin, Key, CalendarCheck, Ruler } from "lucide-react";
import { PLAN_CATALOG, DEPOSIT_EUR, VEHICLE_CLASS_LABEL } from "@/lib/booking-rules";

const CRAFTER_PHOTO =
  "https://pnpbvdmmrwfvenurqwro.supabase.co/storage/v1/object/public/vehicles/43261a5f-cd8a-4bd4-a3db-f89c4741c463/photo-1789059492885-am91s6bp.png";

const ADDRESS = "Calwer Straße 29, 75331 Engelsbrand-Grunbach";

/** Einstiegstarife – Preise für den extra langen Crafter (L5H2) aus der zentralen Preisquelle. */
const ENTRY = ["3h", "6h", "24h_300"].map((id) => PLAN_CATALOG.find((p) => p.id === id)!);
const CRAFTER_ENTRY_PRICE = Math.min(...ENTRY.map((p) => p.priceL5h2));

const TITLE = "Transporter mieten Pforzheim & Calw – Abholung Grunbach | MyTransporter";
const DESCRIPTION = `Transporter für Pforzheim & Calw mieten: VW Crafter L5H2 mit Hochdach, Abholung in ${ADDRESS}. Ab ${CRAFTER_ENTRY_PRICE} € für 3 Stunden, persönliche Schlüsselübergabe, online buchbar.`;

export const Route = createFileRoute("/transporter-mieten-pforzheim-calw")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index,follow" },
      { name: "geo.region", content: "DE-BW" },
      { name: "geo.placename", content: "Engelsbrand-Grunbach" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Transporter für Pforzheim & Calw mieten – Abholung Grunbach" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:locale", content: "de_DE" },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://www.mytransporter.org/transporter-mieten-pforzheim-calw",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AutoRental",
          name: "MyTransporter – Abholung Grunbach",
          url: "https://www.mytransporter.org/transporter-mieten-pforzheim-calw",
          image: CRAFTER_PHOTO,
          email: "info@mytransporter.org",
          telephone: "+4915236230118",
          priceRange: "€€",
          address: {
            "@type": "PostalAddress",
            streetAddress: "Calwer Straße 29",
            postalCode: "75331",
            addressLocality: "Engelsbrand-Grunbach",
            addressRegion: "BW",
            addressCountry: "DE",
          },
          areaServed: ["Pforzheim", "Calw", "Engelsbrand", "Neuenbürg"],
          makesOffer: ENTRY.map((p) => ({
            "@type": "Offer",
            name: `${p.label} (VW Crafter L5H2)`,
            price: p.priceL5h2,
            priceCurrency: "EUR",
          })),
        }),
      },
    ],
  }),
  component: PforzheimCalwPage,
});

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Wo hole ich den Transporter für Pforzheim & Calw ab?",
    a: `Die Abholung findet in Grunbach statt: ${ADDRESS}. Eine Filiale in Pforzheim oder Calw gibt es nicht – Grunbach ist der Standort dieses Fahrzeugs.`,
  },
  {
    q: "Wie läuft die Schlüsselübergabe?",
    a: "Die Übergabe erfolgt persönlich vor Ort zum gebuchten Abholtermin. Bring deinen Führerschein und Ausweis mit.",
  },
  {
    q: "Zu welchen Zeiten kann ich abholen?",
    a: "Die Abholzeit legst du bei der Buchung fest. Die Übergabe ist an den gebuchten Termin gebunden – eine Selbstabholung rund um die Uhr gibt es an diesem Standort nicht.",
  },
  {
    q: "Ab welchem Alter kann ich mieten?",
    a: "Mieten und registrieren kannst du ab 25 Jahren.",
  },
  {
    q: "Was kostet die Kaution?",
    a: `Die Kaution beträgt ${DEPOSIT_EUR} € zusätzlich zum Mietpreis; Abrechnung und Rückzahlung erfolgen gemäß Mietbedingungen.`,
  },
  {
    q: "Wie ist die Tankregel?",
    a: "Rückgabe mit gleichem Tankstand wie bei Übergabe. Kraftstoff wird separat von dir getragen.",
  },
];

function PforzheimCalwPage() {
  return (
    <main className="min-h-screen bg-background pt-12">
      <Navbar />

      <section className="px-4 pt-8 pb-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
            Transporter für Pforzheim &amp; Calw mieten
          </h1>
          <div className="mt-4 rounded-2xl border-2 border-foreground bg-card p-4">
            <p className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />
              Abholung in Grunbach
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{ADDRESS}</p>
          </div>
          <p className="mt-4 text-base text-muted-foreground">
            Für die Region Pforzheim und Calw steht unser extra langer VW Crafter L5H2 mit Hochdach
            bereit – passend für Umzug, Möbeltransport, Baumarktfahrten und große
            Kleinanzeigen-Abholungen. Du buchst online, holst das Fahrzeug in Grunbach ab und
            bekommst den Schlüssel zum gebuchten Termin persönlich übergeben.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link
              to="/"
              hash="booking"
              className="w-full sm:w-auto rounded-full bg-foreground text-background px-8 py-3.5 text-base font-semibold text-center hover:opacity-90 transition"
            >
              Jetzt Zeitraum wählen &amp; buchen
            </Link>
            <Link
              to="/preise"
              className="w-full sm:w-auto rounded-full border-2 border-foreground text-foreground px-8 py-3 text-base font-semibold text-center hover:bg-secondary transition"
            >
              Alle Tarife &amp; Preise
            </Link>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Wähle im Buchungsablauf <strong className="text-foreground">Crafter L5H2, Abholung
            Grunbach</strong> und deinen Zeitraum – die Verfügbarkeit wird dort für dein Fahrzeug
            und deinen Zeitraum geprüft.
          </p>
        </div>
      </section>

      <section className="px-4 py-6">
        <div className="max-w-4xl mx-auto grid gap-6 md:grid-cols-2 items-start">
          <img
            src={CRAFTER_PHOTO}
            alt="VW Crafter L5H2 mit Hochdach – Abholung in Engelsbrand-Grunbach"
            className="w-full rounded-2xl border border-border object-cover"
            loading="lazy"
          />
          <div>
            <h2 className="text-xl font-bold text-foreground">
              VW Crafter 2.5 · {VEHICLE_CLASS_LABEL.l5h2}
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Ruler className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                Laderaum ca. 470 cm lang, 214 cm hoch, rund 17 m³ – Hochdach, aufrecht beladbar
              </li>
              <li className="flex gap-2">
                <Key className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                Persönliche Schlüsselübergabe vor Ort in Grunbach
              </li>
              <li className="flex gap-2">
                <CalendarCheck className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                Online buchen, Termin und Uhrzeit selbst wählen
              </li>
              <li className="flex gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                Diesel · 3 Sitze · Rückgabe mit gleichem Tankstand wie bei Übergabe
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-foreground">
            Preise für den Crafter L5H2 (Abholung Grunbach)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Diese Preise gelten für den extra langen Crafter mit Hochdach – nicht für den kleineren
            Transporter in Leonberg. Kaution {DEPOSIT_EUR} € (wird zurückerstattet).
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {ENTRY.map((plan) => (
              <div key={plan.id} className="rounded-2xl border-2 border-border bg-card p-4 text-center">
                <span className="block text-xs text-muted-foreground">{plan.shortLabel}</span>
                <span className="mt-1 block text-2xl font-bold text-foreground">
                  {plan.priceL5h2} €
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  inkl. {plan.freeKm} km
                </span>
              </div>
            ))}
          </div>
          <Link
            to="/preise"
            className="mt-3 inline-block text-sm underline text-muted-foreground hover:text-foreground transition-colors"
          >
            Alle Tarife inklusive Mehrtages- und Langzeitmiete
          </Link>
        </div>
      </section>

      <section className="px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-foreground">Häufige Fragen</h2>
          <dl className="mt-4 space-y-4">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-2xl border border-border bg-card p-4">
                <dt className="font-semibold text-foreground">{item.q}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="py-12 text-center text-sm text-muted-foreground border-t border-border">
        <p>© 2026 MyTransporter. Alle Rechte vorbehalten.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-4">
          <Link to="/preise" className="hover:text-foreground transition-colors">Tarife &amp; Preise</Link>
          <Link to="/impressum" className="hover:text-foreground transition-colors">Impressum</Link>
          <Link to="/agb" className="hover:text-foreground transition-colors">AGB</Link>
          <Link to="/datenschutz" className="hover:text-foreground transition-colors">Datenschutz</Link>
          <Link to="/kontakt" className="hover:text-foreground transition-colors">Kontakt</Link>
          <Link to="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
        </div>
      </footer>
    </main>
  );
}
