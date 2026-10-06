import { createFileRoute, Link } from "@tanstack/react-router";
import { InFlowAd } from "@/components/ads/InFlowAd";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { pageHead, SITE_URL, ORG_ID } from "@/lib/seo";
import { Navbar } from "@/components/Navbar";
import { TariffSection } from "@/components/TariffSection";
import { AddonPackagesSection } from "@/components/AddonPackagesSection";
import {
  PLAN_CATALOG,
  L4H2_SURCHARGE_PER_DAY_EUR,
  L5H2_SURCHARGE_EUR,

  DEPOSIT_EUR,
  KM_TARIFF_CENTS_PER_KM,
  KM_TARIFF_MIN_EUR,
} from "@/lib/booking-rules";
import { AdRails } from "@/components/ads/AdRails";
import { AdConsentRevokeButton } from "@/components/ads/AdConsentRevokeButton";
import { VideoBackground } from "@/components/VideoBackground";
import retroVideo from "@/assets/videos/mytransporter-retro.mp4.asset.json";
import retroPoster from "@/assets/videos/mytransporter-retro-poster.jpg.asset.json";

const ENTRY = ["3h", "6h", "24h_300"].map((id) => PLAN_CATALOG.find((p) => p.id === id)!);
const LONG = ["24h_500", "24h_800"].map((id) => PLAN_CATALOG.find((p) => p.id === id)!);
const MIN_PRICE = Math.min(...PLAN_CATALOG.map((p) => p.price));

export const Route = createFileRoute("/preise")({
  head: () =>
    pageHead({
      path: "/preise",
      title: `Preise: Transporter mieten ab ${MIN_PRICE} € in Leonberg | MyTransporter`,
      description: `Alle Tarife im Überblick: ${PLAN_CATALOG.slice(0, 3).map((p) => `${p.shortLabel} ${p.price} €`).join(", ")}, Mehrtages- und Wochentarife. Kaution ${DEPOSIT_EUR} €, Rückgabe vollgetankt.`,
      breadcrumbs: [{ name: "Start", path: "/" }, { name: "Preise", path: "/preise" }],
      schema: [
        {
          "@type": "OfferCatalog",
          "@id": `${SITE_URL}/preise#tarife`,
          name: "Tarife Transporter L1H1",
          provider: { "@id": ORG_ID },
          itemListElement: PLAN_CATALOG.map((p) => ({
            "@type": "Offer",
            name: `${p.label} (L1H1)`,
            price: p.price,
            priceCurrency: "EUR",
          })),
        },
      ],
    }),
  component: PreisePage,
});

function PreisePage() {
  return (
    <main className="relative isolate min-h-screen overflow-x-hidden bg-background pt-12">
      <VideoBackground
        src={retroVideo.url}
        poster={retroPoster.url}
        title="MyTransporter Preise Video"
      />
      <Navbar />
      <div className="relative z-10">
      <AdRails>

      <section className="pt-10 pb-2 px-4">
        <div className="max-w-3xl mx-auto text-center">
            <div className="rounded-3xl bg-background/90 backdrop-blur-md px-6 py-8 sm:px-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
            Transporter mieten – Tarife &amp; Preise ab {MIN_PRICE} €
          </h1>
          <p className="mt-4 text-muted-foreground">
            Alle Festpreise für die Transporter-Miete in Leonberg, Stuttgart, Böblingen und
            Sindelfingen – ob Umzug, Möbeltransport, Baumarkt-Fahrt oder Kleinanzeigen-Abholung.
            Angegeben ist der Preis für den kurzen L1H1; der lange L4H2 mit Hochdach kostet{" "}
            {L4H2_SURCHARGE_PER_DAY_EUR} € pro Miettag mehr, der extra lange VW Crafter noch einmal
            rund {L5H2_SURCHARGE_EUR} € mehr.

          </p>
            </div>
          <p className="mt-4 inline-block rounded-xl border-2 border-foreground bg-secondary/40 px-4 py-3 text-sm font-medium text-foreground">
            Viele Freikilometer und maximal 1.000 € Selbstbeteiligung bereits inklusive –
            ohne kostenpflichtiges Schutzpaket.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ENTRY.map((p) => (
              <div key={p.id} className="rounded-2xl border-2 border-border bg-card p-5 text-center">
                <p className="text-sm text-muted-foreground">{p.shortLabel}</p>
                <p className="text-3xl font-bold text-foreground mt-1">{p.price} €</p>
                <p className="text-xs text-muted-foreground mt-1">
                  L4H2 {p.priceL4h2} € · Crafter {p.priceL5h2} €
                </p>

                <p className="text-xs text-muted-foreground mt-1">inkl. {p.freeKm.toLocaleString("de-DE")} km</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LONG.map((p) => (
              <div key={p.id} className="rounded-2xl border border-border bg-card p-5 text-center">
                <p className="text-sm text-muted-foreground">{p.label}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{p.price} €</p>
                <p className="text-xs text-muted-foreground mt-1">
                  L4H2 {p.priceL4h2} € · Crafter {p.priceL5h2} € · Tarif mit{" "}
                  {p.freeKm.toLocaleString("de-DE")} Kilometern inklusive
                </p>

              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link
              to="/"
              hash="booking"
              className="rounded-full bg-foreground text-background px-8 py-3.5 text-base font-semibold hover:opacity-90 transition"
            >
              Jetzt buchen
            </Link>
            <a
              href="tel:+4915236230118"
              className="rounded-full border-2 border-foreground text-foreground px-8 py-3 text-base font-semibold hover:bg-secondary transition"
            >
              0152 3623 0118 anrufen
            </a>
          </div>

          <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left text-sm">
            {[
              `Kaution ${DEPOSIT_EUR} € – wird nach ordnungsgemäßer Rückgabe zurückerstattet`,
              "Tankregel Voll/Voll: Das Fahrzeug wird vollgetankt übergeben und muss vollgetankt zurückgegeben werden (Tankbeleg erforderlich)",
              "Selbstbeteiligung im Schadensfall maximal 1.000 €",
              `Reiner Kilometer-Tarif: ${(KM_TARIFF_CENTS_PER_KM / 100).toFixed(2).replace(".", ",")} € / km (Mindestbetrag ${KM_TARIFF_MIN_EUR.l1h1} € / L4H2 ${KM_TARIFF_MIN_EUR.l4h2} € / Crafter ${KM_TARIFF_MIN_EUR.l5h2} €)`,
              "Mindestalter 25 Jahre, Führerschein Klasse B, digitale Verifizierung",
              "Umzugspaket für 29 € oder Fahrer / Umzugshelfer für 25 € pro Stunde (Mindestabnahme 3 Stunden) optional dazubuchbar",
            ].map((t) => (
              <li
                key={t}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-foreground"
              >
                <span className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-foreground flex-shrink-0" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <InFlowAd placement="inFlowTop" />
      <TariffSection />
      <AddonPackagesSection />
      <InFlowAd placement="inFlowBottom" />

      <section className="pb-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <Link
            to="/"
            hash="booking"
            className="inline-block rounded-full bg-foreground text-background px-10 py-4 text-base font-semibold hover:opacity-90 transition"
          >
            Verfügbarkeit prüfen &amp; buchen
          </Link>
          <div className="text-left"><RelatedLinks exclude="/preise" /></div>
        </div>
      </section>

      <footer className="py-12 text-center text-sm text-muted-foreground border-t border-border">
        <p>© 2026 MyTransporter. Alle Rechte vorbehalten.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-4">
          <Link to="/" className="hover:text-foreground transition-colors">Startseite</Link>
          <Link to="/impressum" className="hover:text-foreground transition-colors">Impressum</Link>
          <Link to="/agb" className="hover:text-foreground transition-colors">AGB</Link>
          <Link to="/datenschutz" className="hover:text-foreground transition-colors">Datenschutz</Link>
          <AdConsentRevokeButton />
          <Link to="/kontakt" className="hover:text-foreground transition-colors">Kontakt</Link>
          <Link to="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
          <Link to="/ueber-uns" className="hover:text-foreground transition-colors">Über uns</Link>
        </div>
      </footer>
    </AdRails>
      </div>
    </main>
  );
}
