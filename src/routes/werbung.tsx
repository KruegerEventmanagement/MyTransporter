import { useState } from "react";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronDown, Megaphone, Repeat, Eye, MapPin } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { TransporterPhotoDiagram } from "@/components/partner/TransporterPhotoDiagram";
import { PartnerPackages } from "@/components/partner/PartnerPackages";
import { PartnerAreaPicker } from "@/components/partner/PartnerAreaPicker";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PartnerBenefits } from "@/components/partner/PartnerBenefits";
import { PartnerInquiryForm } from "@/components/partner/PartnerInquiryForm";
import type { PartnerPackageId } from "@/lib/partner-packages";
import { AdRails } from "@/components/ads/AdRails";
import { AdConsentRevokeButton } from "@/components/ads/AdConsentRevokeButton";
import { VideoBackground } from "@/components/VideoBackground";
import egyptVideo from "@/assets/videos/mytransporter-egypt.mp4.asset.json";
import egyptPoster from "@/assets/videos/mytransporter-egypt-poster.jpg.asset.json";

export const Route = createFileRoute("/werbung")({
  head: () =>
    pageHead({
      path: "/werbung",
      title: "Werbefläche am Transporter mieten in Leonberg & Stuttgart | MyTransporter",
      description: "Ihre Werbung durch die gesamte Region: Werbefläche am MyTransporter mieten, ab 29 € netto / Monat. Täglich sichtbar in Leonberg, Stuttgart und Baden-Württemberg.",
      breadcrumbs: [{ name: "Start", path: "/" }, { name: "Werbung am Transporter", path: "/werbung" }],
    }),
  component: WerbungPage,
});

function WerbungPage() {
  const [selected, setSelected] = useState<PartnerPackageId>("S1");

  const scrollToForm = () => {
    document.getElementById("partner-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSelect = (id: PartnerPackageId) => {
    setSelected(id);
    scrollToForm();
  };

  return (
    <main className="relative isolate min-h-screen overflow-x-hidden bg-background pt-12">
      <VideoBackground
        src={egyptVideo.url}
        poster={egyptPoster.url}
        title="MyTransporter Werbefläche Video"
      />
      <Navbar />
      <div className="relative z-10">
      <AdRails>

      {/* Back link */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Zur Startseite
        </Link>
      </div>

      {/* Hero */}
      <section className="px-4 pt-8 pb-12">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-3xl bg-background/90 backdrop-blur-md px-6 py-8 sm:px-10">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-secondary text-foreground border border-border">
              <Megaphone className="w-3 h-3" />
              Werbefläche am Transporter mieten
            </span>
            <h1 className="mt-4 text-3xl md:text-5xl font-bold text-foreground animate-fade-in-up">
              Ihre Werbung durch die gesamte Region
            </h1>
            <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed animate-fade-in-up animate-delay-200">
              MyTransporter ist täglich unterwegs: Leonberg, Stuttgart, Böblingen, Sindelfingen,
              Ludwigsburg – auf Wunsch Baden-Württemberg- und deutschlandweit. Ihre Werbung fährt mit
              und wird bei Veranstaltungen, am Baumarkt, beim IKEA, vor Cafés und in Wohngebieten
              gesehen. Schon ab 29 € netto im Monat.
            </p>
          </div>
          <div className="mt-5 grid sm:grid-cols-3 gap-2 text-left">
            {[
              { icon: MapPin, t: "Ganze Region", d: "Leonberg, Stuttgart & Umgebung, auf Wunsch bundesweit" },
              { icon: Eye, t: "24/7 sichtbar", d: "Fahrend und parkend, ohne Streuverlust" },
              { icon: Repeat, t: "Wiedererkennung", d: "Immer wieder gesehen = unterbewusst gemerkt" },
            ].map((f) => (
              <div key={f.t} className="p-3 rounded-xl bg-secondary/50 border border-border">
                <f.icon className="w-4 h-4 text-foreground" />
                <div className="mt-1.5 text-sm font-semibold text-foreground">{f.t}</div>
                <div className="text-xs text-muted-foreground leading-snug">{f.d}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={scrollToForm}
              className="rounded-full bg-foreground text-background px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Jetzt Fläche buchen
            </button>
            <a
              href="#packages"
              className="rounded-full bg-secondary text-foreground border border-border px-6 py-3 text-sm font-medium hover:bg-muted transition-colors"
            >
              Flächen & Preise ansehen
            </a>
          </div>
        </div>
      </section>

      {/* Warum Fahrzeugwerbung wirkt */}
      <section className="px-4 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl bg-background/90 backdrop-blur-md px-6 py-8 sm:px-10 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              Warum Werbung am Fahrzeug so gut wirkt
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Ein Motiv, das man immer wieder auf einem fahrenden oder parkenden Transporter sieht,
              bleibt stärker hängen als eine einzelne Anzeige. Dieser Wiederholungseffekt sorgt dafür,
              dass Ihr Name unterbewusst gelernt und später wiedererkannt wird – genau dann, wenn
              jemand Ihre Leistung braucht.
            </p>
          </div>
          <div className="mt-8 grid sm:grid-cols-3 gap-4">
            {[
              {
                t: "Fahrzeugwerbung",
                d: "Feste Kosten pro Monat, 24/7 sichtbar in der ganzen Region, starker Wiederholungseffekt, keine Klickpreise.",
                highlight: true,
              },
              {
                t: "Flyer",
                d: "Wird meist einmal gesehen und weggeworfen, jeder neue Kontakt kostet erneut Druck und Verteilung.",
                highlight: false,
              },
              {
                t: "Online-Ads",
                d: "Sichtbar nur solange bezahlt wird, Klickpreise steigen, wird oft weggeklickt oder geblockt.",
                highlight: false,
              },
            ].map((c) => (
              <div
                key={c.t}
                className={`p-5 rounded-2xl border ${c.highlight ? "bg-foreground border-foreground" : "bg-card border-border"}`}
              >
                <h3 className={`text-sm font-bold ${c.highlight ? "text-background" : "text-foreground"}`}>{c.t}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${c.highlight ? "text-background/80" : "text-muted-foreground"}`}>
                  {c.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Transporter Diagram */}
      <section className="px-4 pb-16">
        <div className="max-w-4xl mx-auto p-6 sm:p-10 rounded-3xl bg-secondary/40 border border-border text-foreground">
          <h2 className="text-xl md:text-2xl font-bold text-center mb-2">
            Werbeflächen am Transporter
          </h2>
          <p className="text-center text-sm text-muted-foreground mb-6">
            Optimierte Flächenaufteilung für maximale Sichtbarkeit, Citroën Jumper / Peugeot Boxer L4H3.
          </p>
          <TransporterPhotoDiagram highlight={selected} onSelect={handleSelect} />
        </div>
      </section>

      {/* Packages */}
      <section id="packages" className="px-4 pb-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center">
            Flächen, Größen & Preise
          </h2>
          <p className="mt-3 text-center text-muted-foreground">
            Je länger die Laufzeit, desto günstiger der Jahrespreis. Alle Preise zzgl. einmaliger
            Bearbeitungsgebühr für die Produktion der Magnetfolie.
          </p>
          <div className="mt-8">
            <PartnerAreaPicker highlight={selected} onSelect={setSelected} />
          </div>
          <Collapsible className="mt-6">
            <CollapsibleTrigger className="mx-auto flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:border-foreground/40">
              Alle Flächen anzeigen
              <ChevronDown className="h-3.5 w-3.5" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-8">
              <PartnerPackages highlight={selected} onSelect={handleSelect} />
            </CollapsibleContent>
          </Collapsible>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Weitere kleine Flächen (z. B. Stoßstange, Säulen) auf Anfrage individuell verfügbar.
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="px-4 pb-16 bg-secondary/40 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center">
            Warum Magnetfolie?
          </h2>
          <p className="mt-3 text-center text-muted-foreground max-w-2xl mx-auto">
            Wir produzieren deine Werbung als hochwertige Magnetfolie. Das hat für dich nur Vorteile:
          </p>
          <div className="mt-8">
            <PartnerBenefits />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center">So funktioniert's</h2>
          <div className="mt-8 grid sm:grid-cols-3 gap-4">
            {[
              { n: 1, t: "Anfrage senden", d: "Wähle Fläche und Laufzeit, schick uns dein Motiv oder deine Wünsche." },
              { n: 2, t: "Angebot & Produktion", d: "Du bekommst ein verbindliches Angebot. Wir produzieren die Magnetfolie." },
              { n: 3, t: "Folie wird montiert", d: "Wir bringen die Folie am Transporter an, deine Werbung läuft." },
            ].map((s) => (
              <div key={s.n} className="p-5 rounded-2xl bg-card border border-border">
                <div className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center font-bold">
                  {s.n}
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">{s.t}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      {/* Online-Werbung auf der Website */}
      <section id="online-werbung" className="px-4 pb-16 scroll-mt-20">
        <div className="max-w-4xl mx-auto rounded-3xl border border-border bg-card p-6 sm:p-10">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center">
            Online-Werbung auf MyTransporter
          </h2>
          <p className="mt-3 text-center text-muted-foreground max-w-2xl mx-auto">
            Neben der Fläche am Transporter kannst du auch Werbeplätze auf unserer Website buchen.
            Unsere Seiten werden vor allem von Menschen besucht, die gerade einen Transport, Umzug
            oder ein Projekt planen – also in einem Moment mit konkretem Bedarf.
          </p>

          <div className="mt-8 grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-secondary/40 p-5">
              <h3 className="text-sm font-bold text-foreground">Passende Branchen</h3>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>Umzugsunternehmen &amp; Umzugshelfer</li>
                <li>Möbelhäuser &amp; Möbelhandel</li>
                <li>Baumarkt &amp; Baustoffe</li>
                <li>Handwerk (Maler, Elektro, Sanitär, Montage)</li>
                <li>Lagerflächen &amp; Selfstorage</li>
                <li>Fahrzeugservice (Werkstatt, Reifen, Pflege)</li>
                <li>Gewerbe &amp; Dienstleistungen aus der Region</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/40 p-5">
              <h3 className="text-sm font-bold text-foreground">Mögliche Platzierungen</h3>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>Desktop: Banner in den freien seitlichen Werbespalten links und rechts</li>
                <li>Ausschließlich Desktop ab großer Bildschirmbreite, nicht auf Handy oder Tablet</li>
                <li>Keine Banner innerhalb oder zwischen Inhaltsabschnitten</li>
                <li>Keine Pop-ups, keine Einblendungen über dem Inhalt, keine mobilen Werbeplätze</li>
              </ul>
            </div>
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            Preise für Online-Werbeplätze <span className="font-semibold text-foreground">auf Anfrage</span>,
            abhängig von Platzierung und Laufzeit. Wir stimmen Format, Zeitraum und Preis individuell
            mit dir ab.
          </p>

          <div className="mt-6 flex justify-center">
            <a
              href="mailto:info@mytransporter.org?subject=Anfrage%20Online-Werbung%20auf%20MyTransporter"
              className="rounded-full bg-foreground text-background px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Online-Werbung anfragen
            </a>
          </div>
        </div>
      </section>

      <section id="partner-form" className="px-4 pb-24 scroll-mt-20">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center">
            Jetzt unverbindlich anfragen
          </h2>
          <p className="mt-3 text-center text-muted-foreground">
            Schick uns deine Anfrage, wir melden uns innerhalb von 1-2 Werktagen mit einem konkreten Angebot.
          </p>
          <div className="mt-8">
            <PartnerInquiryForm selectedPackage={selected} onPackageChange={setSelected} />
          </div>
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
        </div>
      </footer>
    </AdRails>
      </div>
    </main>
  );
}