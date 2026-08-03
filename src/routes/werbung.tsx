import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { TransporterPhotoDiagram } from "@/components/partner/TransporterPhotoDiagram";
import { PartnerPackages } from "@/components/partner/PartnerPackages";
import { PartnerBenefits } from "@/components/partner/PartnerBenefits";
import { PartnerInquiryForm } from "@/components/partner/PartnerInquiryForm";
import type { PartnerPackageId } from "@/lib/partner-packages";

export const Route = createFileRoute("/werbung")({
  head: () => ({
    meta: [
      { title: "Partner werden · Werbefläche am Transporter mieten | MyTransporter" },
      {
        name: "description",
        content:
          "Werde Werbepartner von MyTransporter in Leonberg & Stuttgart. Miete eine Magnetfolien-Werbefläche an unserem Transporter, flexibel, lackschonend, mobil sichtbar.",
      },
      { property: "og:title", content: "Partner werden | MyTransporter" },
      {
        property: "og:description",
        content:
          "Sponsor & Werbepartner werden: über 25 Magnetfolien-Werbeflächen am Transporter, ab 29 € netto / Monat (zzgl. 19% MwSt., B2B).",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.mytransporter.org/partner" }],
  }),
  component: PartnerPage,
});

function PartnerPage() {
  const [selected, setSelected] = useState<PartnerPackageId>("S1");

  const scrollToForm = () => {
    document.getElementById("partner-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSelect = (id: PartnerPackageId) => {
    setSelected(id);
    scrollToForm();
  };

  return (
    <main className="min-h-screen bg-background pt-12">
      <Navbar />

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
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-secondary text-foreground border border-border">
            <Sparkles className="w-3 h-3" />
            Sponsoring & Werbung
          </span>
          <h1 className="mt-4 text-3xl md:text-5xl font-bold text-foreground animate-fade-in-up">
            Werbeflächen am Transporter
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed animate-fade-in-up animate-delay-200">
            Über 25 buchbare Plätze, vom Hauptsponsor bis zum Mini-Spot. Lass dein Unternehmen täglich
            durch Leonberg, Stuttgart, Böblingen und die ganze Region fahren. Hochwertige Magnetfolie,
            jederzeit austauschbar und lackschonend.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={scrollToForm}
              className="rounded-full bg-foreground text-background px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Anfrage senden
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
            <PartnerPackages highlight={selected} onSelect={handleSelect} />
          </div>
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
          <Link to="/kontakt" className="hover:text-foreground transition-colors">Kontakt</Link>
        </div>
      </footer>
    </main>
  );
}