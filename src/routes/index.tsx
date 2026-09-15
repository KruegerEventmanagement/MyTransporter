import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { HeroSection } from "@/components/HeroSection";
import { BookingSection } from "@/components/BookingSection";
import { Navbar } from "@/components/Navbar";

import { AdBanner } from "@/components/AdBanner";
import { getPlanById } from "@/lib/booking-rules";

const ENTRY_3H = getPlanById("3h")!;
/** Einstiegspreise aus dem zentralen Tarifkatalog – keine eigenen Preise auf dieser Seite. */
const LEO_ENTRY = ENTRY_3H.price;
const CRAFTER_ENTRY = ENTRY_3H.priceL5h2;
const META_DESCRIPTION = `Leonberg & Stuttgart: Abholung Leonberg ab ${LEO_ENTRY} € für 3 Stunden. Pforzheim & Calw: VW Crafter ab ${CRAFTER_ENTRY} € für 3 Stunden, Abholung in Grunbach. Online buchen.`;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Transporter mieten – Leonberg, Stuttgart, Pforzheim & Calw | MyTransporter" },
      {
        name: "description",
        content: META_DESCRIPTION,
      },

      { name: "robots", content: "index,follow" },
      { name: "geo.region", content: "DE-BW" },
      { name: "geo.placename", content: "Leonberg, Stuttgart, Pforzheim, Calw" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Transporter mieten – Leonberg, Stuttgart, Pforzheim & Calw" },
      {
        property: "og:description",
        content:
          "Festpreise ab 49 €: 3 Stunden 49 €, 6 Stunden 69 €, 24 Stunden 99 €, Langstrecke 189 € (500 km). Abholung Leonberg für Leonberg & Stuttgart, Abholung Grunbach für Pforzheim & Calw. Kaution 200 €, Rückgabe vollgetankt (Voll/Voll).",
      },

      { property: "og:locale", content: "de_DE" },
    ],
    links: [{ rel: "canonical", href: "https://www.mytransporter.org/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AutoRental",
          name: "MyTransporter",
          image: "https://www.mytransporter.org/icons/icon-192.png",
          url: "https://www.mytransporter.org/",
          telephone: "+4915236230118",
          email: "info@mytransporter.org",
          priceRange: "€€",
          address: {
            "@type": "PostalAddress",
            streetAddress: "Römerstraße 36",
            postalCode: "71229",
            addressLocality: "Leonberg",
            addressRegion: "BW",
            addressCountry: "DE",
          },
          areaServed: ["Leonberg", "Stuttgart", "Böblingen", "Sindelfingen", "Ludwigsburg"],
          makesOffer: [
            { "@type": "Offer", name: "3 Stunden Express (L1H1)", price: 49, priceCurrency: "EUR" },
            { "@type": "Offer", name: "6 Stunden Umzug Mini (L1H1)", price: 69, priceCurrency: "EUR" },
            { "@type": "Offer", name: "24 Stunden Umzugstag (L1H1)", price: 99, priceCurrency: "EUR" },
            { "@type": "Offer", name: "24 Stunden Langstrecke 500 km (L1H1)", price: 189, priceCurrency: "EUR" },
            { "@type": "Offer", name: "24 Stunden Fernstrecke 800 km (L1H1)", price: 299, priceCurrency: "EUR" },
          ],
          openingHoursSpecification: {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
            opens: "08:00",
            closes: "22:00",
          },
        }),
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background pt-12">
      
      <Navbar />
      <HeroSection />
      <AdBanner />
      <h1 className="sr-only">Transporter mieten in Leonberg &amp; Stuttgart ab 49 € – Umzug, Möbeltransport &amp; Baumarkt</h1>
      <section className="px-4 pb-2">
        <div className="max-w-3xl mx-auto grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border-2 border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">Leonberg &amp; Stuttgart: Abholung Leonberg</p>
            <p className="mt-1 text-xs text-muted-foreground">Poststraße 60, 71229 Leonberg</p>
          </div>
          <Link
            to="/transporter-mieten-pforzheim-calw"
            className="rounded-2xl border-2 border-border bg-card p-4 hover:border-foreground transition-colors"
          >
            <p className="text-sm font-semibold text-foreground">Pforzheim &amp; Calw: Abholung Grunbach</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Calwer Straße 29, 75331 Engelsbrand-Grunbach · VW Crafter L5H2
            </p>
          </Link>
        </div>
      </section>
      <BookingSection />

      <footer className="py-12 text-center text-sm text-muted-foreground border-t border-border">
        <p>© 2026 MyTransporter. Alle Rechte vorbehalten.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-4">
          <Link to="/preise" className="hover:text-foreground transition-colors">Tarife & Preise</Link>
          <Link to="/impressum" className="hover:text-foreground transition-colors">Impressum</Link>
          <Link to="/agb" className="hover:text-foreground transition-colors">AGB</Link>
          <Link to="/datenschutz" className="hover:text-foreground transition-colors">Datenschutz</Link>
          <Link to="/kontakt" className="hover:text-foreground transition-colors">Kontakt</Link>
          <Link to="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
          <Link to="/ueber-uns" className="hover:text-foreground transition-colors">Über uns</Link>
          <Link to="/werbung" className="hover:text-foreground transition-colors">Werbung am Transporter</Link>
        </div>
      </footer>
    </main>
  );
}
