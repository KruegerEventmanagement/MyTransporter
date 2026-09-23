import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { PLAN_CATALOG, DEPOSIT_EUR } from "@/lib/booking-rules";
const HOME_MIN_PRICE = Math.min(...PLAN_CATALOG.map((p) => p.price));
const HOME_DAY_PRICE = PLAN_CATALOG.find((p) => p.id === "24h_300")!.price;
import { Link } from "@tanstack/react-router";
import { HeroSection } from "@/components/HeroSection";
import { BookingSection } from "@/components/BookingSection";
import { Navbar } from "@/components/Navbar";

import { SocialBanner } from "@/components/SocialBanner";
import { AdRails } from "@/components/ads/AdRails";
import { AdConsentRevokeButton } from "@/components/ads/AdConsentRevokeButton";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead({
      path: "/",
      title: `Transporter mieten in Leonberg ab ${HOME_MIN_PRICE} € | MyTransporter`,
      description: `Transporter online mieten in Leonberg – auch für Stuttgart, Böblingen und Sindelfingen. 3 Stunden ab ${HOME_MIN_PRICE} €, 24 Stunden ab ${HOME_DAY_PRICE} €, Wochenmiete und Langzeitmiete. Kaution ${DEPOSIT_EUR} €.`,
    }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background pt-12">
      
      <Navbar />
      <AdRails>
        <HeroSection />
        <h1 className="sr-only">Transporter mieten in Leonberg & Stuttgart ab 49 € – Umzug, Möbeltransport & Baumarkt</h1>
        <BookingSection />
        <SocialBanner />
      </AdRails>
      <footer className="py-12 text-center text-sm text-muted-foreground border-t border-border">
        <p>© 2026 MyTransporter. Alle Rechte vorbehalten.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-4">
          <Link to="/preise" className="hover:text-foreground transition-colors">Tarife & Preise</Link>
          <Link to="/impressum" className="hover:text-foreground transition-colors">Impressum</Link>
          <Link to="/agb" className="hover:text-foreground transition-colors">AGB</Link>
          <Link to="/datenschutz" className="hover:text-foreground transition-colors">Datenschutz</Link>
          <AdConsentRevokeButton />
          <Link to="/kontakt" className="hover:text-foreground transition-colors">Kontakt</Link>
          <Link to="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
          <Link to="/ueber-uns" className="hover:text-foreground transition-colors">Über uns</Link>
          <Link to="/werbung" className="hover:text-foreground transition-colors">Werbung am Transporter</Link>
        </div>
      </footer>
    </main>
  );
}
