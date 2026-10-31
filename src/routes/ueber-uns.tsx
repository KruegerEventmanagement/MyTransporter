import { createFileRoute, Link } from "@tanstack/react-router";
import { InFlowAd } from "@/components/ads/InFlowAd";
import { pageHead } from "@/lib/seo";
import { Navbar } from "@/components/Navbar";
import { TariffSection } from "@/components/TariffSection";
import { AdvantagesSection } from "@/components/AdvantagesSection";
import { CompareSection } from "@/components/CompareSection";
import { BookingInfoSection } from "@/components/BookingInfoSection";
import { AddonPackagesSection } from "@/components/AddonPackagesSection";
import { AdRails } from "@/components/ads/AdRails";
import { AdConsentRevokeButton } from "@/components/ads/AdConsentRevokeButton";
import founderPhoto from "@/assets/christian-krueger.jpeg.asset.json";

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
      <section className="px-4 pb-12">
        <div className="max-w-2xl mx-auto rounded-2xl border border-border bg-card p-6 sm:p-10">
          <img
            src={founderPhoto.url}
            alt="Christian Krüger, Gründer von MyTransporter"
            className="mx-auto h-40 w-40 rounded-full object-cover object-top border border-border"
            loading="lazy"
          />
          <p className="mt-4 text-center font-semibold text-foreground">Christian Krüger</p>
          <p className="text-center text-sm text-muted-foreground">Gründer von MyTransporter</p>
          <div className="mt-8 space-y-5 text-foreground/90 leading-relaxed">
            <p>Hallo, mein Name ist Christian Krüger. Die Idee zu MyTransporter ist aus einem ganz alltäglichen Problem entstanden: Ich wollte einmal einen Tisch von Leonberg-Ezach nach Leonberg-Eltingen bringen – eigentlich nur ein paar Minuten Fahrt. Doch in ganz Leonberg war kein freier Transporter zu finden. Am Ende musste ich bis nach Stuttgart fahren, dort reservieren, abholen und alles wieder zurückbringen. Für einen einzigen Tisch war das ein enormer Aufwand.</p>
            <p>Genau da dachte ich mir: Das muss doch einfacher gehen. Ein Transporter direkt hier vor Ort, unkompliziert online buchbar, ohne lange Wege und zu einem Preis, der fair bleibt. So ist MyTransporter entstanden – ein kleines, lokales Angebot von hier für die Menschen hier.</p>
            <p>Dabei ist mir Ehrlichkeit besonders wichtig. Unsere Transporter sind rund 18 Jahre alt, und das sieht man ihnen auch an. Es gibt Kratzer, kleine Dellen und hier und da eine Tür, die nicht ganz so will, wie sie soll. Was aber zählt: Die Fahrzeuge sind fahrbereit, haben TÜV, neue Bremsen und werden laufend gewartet und erneuert. Ihre Sicherheit steht an erster Stelle und ist zu keinem Zeitpunkt gefährdet.</p>
            <p>Gerade weil wir auf neue, teure Fahrzeuge verzichten, können wir Ihnen so faire Preise anbieten. Ich wünsche mir deshalb ein bisschen Verständnis und Gelassenheit, wenn nicht alles wie neu aussieht – und ein freundliches, faires Miteinander, so wie man es unter Nachbarn eben pflegt.</p>
            <p>Ich freue mich, wenn MyTransporter Ihnen bei Ihrem nächsten Umzug, Möbelkauf oder Projekt ein Stück weiterhilft. Danke für Ihr Vertrauen!</p>
            <p className="font-semibold">Herzliche Grüße<br />Christian</p>
          </div>
        </div>
      </section>
      <AdRails>
        <TariffSection />
        <AddonPackagesSection />
        <AdvantagesSection />
        <InFlowAd placement="inFlowTop" />
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