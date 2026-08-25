import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { TariffSection } from "@/components/TariffSection";
import { AdvantagesSection } from "@/components/AdvantagesSection";
import { CompareSection } from "@/components/CompareSection";
import { BookingInfoSection } from "@/components/BookingInfoSection";
import { AddonPackagesSection } from "@/components/AddonPackagesSection";

export const Route = createFileRoute("/ueber-uns")({
  head: () => ({
    meta: [
      { title: "Über MyTransporter | Transporter mieten in Leonberg & Stuttgart" },
      {
        name: "description",
        content:
          "Zwei Transporter-Klassen (L1H1 kurz, L4H2 lang) mit fairen Kilometern, sauber aufbereitet und technisch gepflegt. Tarife, Vorteile und gute Hinweise rund um die Miete.",
      },
      { property: "og:title", content: "Über MyTransporter" },
      {
        property: "og:description",
        content:
          "Transporter L1H1 und L4H2 zum fairen Festpreis, faire Kilometer, ehrlich kommuniziert. Mehr Platz für Umzug, Renovierung und Projekte.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.mytransporter.org/ueber-uns" }],
  }),
  component: UeberUnsPage,
});

function UeberUnsPage() {
  return (
    <main className="min-h-screen bg-background pt-12">
      <Navbar />
      <section className="pt-10 pb-4 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground">
            Über MyTransporter
          </h1>
          <p className="mt-4 text-muted-foreground">
            Transporter L1H1 und L4H2 zum fairen Festpreis. Mehr Platz, faire Kilometer, ehrlich kommuniziert.
          </p>
        </div>
      </section>
      <TariffSection />
      <AddonPackagesSection />
      <AdvantagesSection />
      <CompareSection />
      <BookingInfoSection />
      <footer className="py-12 text-center text-sm text-muted-foreground border-t border-border">
        <p>© 2026 MyTransporter. Alle Rechte vorbehalten.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-4">
          <Link to="/" className="hover:text-foreground transition-colors">Startseite</Link>
          <Link to="/impressum" className="hover:text-foreground transition-colors">Impressum</Link>
          <Link to="/agb" className="hover:text-foreground transition-colors">AGB</Link>
          <Link to="/datenschutz" className="hover:text-foreground transition-colors">Datenschutz</Link>
          <Link to="/kontakt" className="hover:text-foreground transition-colors">Kontakt</Link>
          <Link to="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
          <Link to="/werbung" className="hover:text-foreground transition-colors">Werbung am Transporter</Link>
        </div>
      </footer>
    </main>
  );
}