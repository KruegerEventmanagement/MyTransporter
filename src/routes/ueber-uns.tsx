import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { Navbar } from "@/components/Navbar";
import { TariffSection } from "@/components/TariffSection";
import { AdvantagesSection } from "@/components/AdvantagesSection";
import { CompareSection } from "@/components/CompareSection";
import { BookingInfoSection } from "@/components/BookingInfoSection";
import { AddonPackagesSection } from "@/components/AddonPackagesSection";
import { AdRails } from "@/components/ads/AdRails";
import { AdConsentRevokeButton } from "@/components/ads/AdConsentRevokeButton";

export const Route = createFileRoute("/ueber-uns")({
  head: () =>
    pageHead({
      path: "/ueber-uns",
      title: "Über MyTransporter – lokale Transporter-Vermietung aus Leonberg",
      description: "Wer hinter MyTransporter steht: Transporter-Vermietung mit kurzen und langen Fahrzeugen, fairen Kilometern und ehrlicher Beschreibung des Fahrzeugzustands.",
      webPageType: "AboutPage",
      breadcrumbs: [{ name: "Start", path: "/" }, { name: "Über uns", path: "/ueber-uns" }],
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
      <AdRails>
        <TariffSection />
        <AddonPackagesSection />
        <AdvantagesSection />
        <CompareSection />
        <BookingInfoSection />
      </AdRails>
      <footer className="py-12 text-center text-sm text-muted-foreground border-t border-border">
        <p>© 2026 MyTransporter. Alle Rechte vorbehalten.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-4">
          <Link to="/" className="hover:text-foreground transition-colors">Startseite</Link>
          <Link to="/preise" className="hover:text-foreground transition-colors">Tarife & Preise</Link>
          <Link to="/impressum" className="hover:text-foreground transition-colors">Impressum</Link>
          <Link to="/agb" className="hover:text-foreground transition-colors">AGB</Link>
          <Link to="/datenschutz" className="hover:text-foreground transition-colors">Datenschutz</Link>
          <AdConsentRevokeButton />
          <Link to="/kontakt" className="hover:text-foreground transition-colors">Kontakt</Link>
          <Link to="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
          <Link to="/werbung" className="hover:text-foreground transition-colors">Werbung am Transporter</Link>
        </div>
      </footer>
    </main>
  );
}