import { createFileRoute, Link } from "@tanstack/react-router";
import { Armchair, Boxes, CarFront, Info } from "lucide-react";
import { pageHead } from "@/lib/seo";
import { Navbar } from "@/components/Navbar";
import { AffiliateOfferGrid } from "@/components/ads/AffiliateOffers";
import { AFFILIATE_DISCLOSURE } from "@/lib/affiliate";

export const Route = createFileRoute("/werbeflaeche")({
  head: () =>
    pageHead({
      path: "/werbeflaeche",
      // Reine Partnerlink-Seite: nicht indexieren, Links folgen; kein AdSense-Inventar.
      robots: "noindex,follow",
      title: "Partnerangebote für Umzug, Möbel & Autozubehör | MyTransporter",
      description:
        "Praktische Tipps für deinen Transport und ausgewählte Partnerangebote rund um Umzug, Möbel, Reifen und Autozubehör. Gekennzeichnete Partnerlinks.",
      breadcrumbs: [{ name: "Start", path: "/" }, { name: "Partnerangebote", path: "/werbeflaeche" }],
    }),
  component: PartnerOffersPage,
});

const TIPS = [
  {
    icon: Boxes,
    t: "Umzug",
    d: "Packe schwere Dinge in kleine Kartons und beschrifte jeden Karton mit Raum und Inhalt. Decken und Gurte schützen Möbel im Laderaum vor Kratzern und Verrutschen.",
  },
  {
    icon: Armchair,
    t: "Möbel",
    d: "Miss große Stücke vor dem Kauf oder Abholen aus und vergleiche sie mit Laderaum und Türöffnung des Transporters. Zerlegte Möbel lassen sich sicherer verladen.",
  },
  {
    icon: CarFront,
    t: "Autozubehör",
    d: "Spanngurte, Antirutschmatten und passende Reifen machen jede Fahrt sicherer. Plane Ladung so, dass schwere Teile unten und nah an der Trennwand liegen.",
  },
];

function PartnerOffersPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-background pt-12">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-bold text-foreground md:text-4xl text-balance">
          Partnerangebote rund um Transport, Umzug und Auto
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Ein paar praktische Hinweise für deine Fahrt mit dem Transporter – und darunter ausgewählte Angebote
          unserer Partner, falls du noch Material, Möbel oder Zubehör brauchst.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {TIPS.map((tip) => (
            <div key={tip.t} className="rounded-2xl border border-border bg-card p-5">
              <tip.icon className="h-5 w-5 text-foreground" aria-hidden="true" />
              <h2 className="mt-2 text-sm font-bold text-foreground">{tip.t}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{tip.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex items-start gap-2 rounded-2xl border border-border bg-secondary/50 p-4 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <strong>Werbung / Affiliate-Links:</strong> Alle folgenden Links sind Partnerlinks. {AFFILIATE_DISCLOSURE}{" "}
            Für dich ändert sich der Preis dadurch nicht. Die Anbieter werden erst kontaktiert, wenn du selbst auf einen
            Link klickst.
          </p>
        </div>

        <div className="mt-8 space-y-10">
          <AffiliateOfferGrid group="left" title="Mobilität & Autozubehör" />
          <AffiliateOfferGrid group="right" title="Wohnen, Umzug & weitere Angebote" />
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Du möchtest als Unternehmen selbst auf MyTransporter werben? Das ist etwas anderes als diese Partnerlinks –
          alle Infos zu Fahrzeugwerbung und festen Website-Werbeplätzen findest du unter{" "}
          <Link to="/werbung" className="underline text-foreground">Werbung bei MyTransporter</Link>.
        </p>
      </div>
      <footer className="border-t border-border py-12 text-center text-sm text-muted-foreground">
        <p>© 2026 MyTransporter. Alle Rechte vorbehalten.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-4">
          <Link to="/" className="hover:text-foreground">Startseite</Link>
          <Link to="/werbung" className="hover:text-foreground">Werbung am Transporter</Link>
          <Link to="/impressum" className="hover:text-foreground">Impressum</Link>
          <Link to="/datenschutz" className="hover:text-foreground">Datenschutz</Link>
        </div>
      </footer>
    </main>
  );
}
