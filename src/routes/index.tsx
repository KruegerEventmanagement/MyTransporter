import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { HeroSection } from "@/components/HeroSection";
import { BookingSection } from "@/components/BookingSection";
import { Navbar } from "@/components/Navbar";
import { AvailabilityNotice } from "@/components/AvailabilityNotice";
import { AdBanner } from "@/components/AdBanner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Transporter mieten in Leonberg & Stuttgart | MyTransporter" },
      {
        name: "description",
        content:
          "Günstige und flexible Transporter-Vermietung in Leonberg, Stuttgart und Umgebung. Ideal für Umzug, Möbeltransport, Kleinanzeigen-Abholung, Baumarkt und kurzfristige Fahrten.",
      },
      { name: "robots", content: "index,follow" },
      { name: "geo.region", content: "DE-BW" },
      { name: "geo.placename", content: "Leonberg, Stuttgart" },
      { property: "og:title", content: "Transporter mieten in Leonberg & Stuttgart | MyTransporter" },
      {
        property: "og:description",
        content:
          "Günstige Transporter-Vermietung in Leonberg, Stuttgart, Böblingen, Sindelfingen und Ludwigsburg. Online buchen ab 90 Cent pro Kilometer, ideal für Umzug, Möbeltransport und kurzfristige Fahrten.",
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
          email: "info@mytransporter.de",
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
      <AvailabilityNotice />
      <Navbar />
      <HeroSection />
      <AdBanner />
      <h1 className="sr-only">Transporter mieten in Leonberg & Stuttgart</h1>
      <BookingSection />
      <footer className="py-12 text-center text-sm text-muted-foreground border-t border-border">
        <p>© 2026 MyTransporter. Alle Rechte vorbehalten.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-4">
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
