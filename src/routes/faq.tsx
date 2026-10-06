import { createFileRoute, Link } from "@tanstack/react-router";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { pageHead } from "@/lib/seo";
import { AdRails } from "@/components/ads/AdRails";
import { AdConsentRevokeButton } from "@/components/ads/AdConsentRevokeButton";
import { BrandHomeLink } from "@/components/BrandHomeLink";

const FAQS = [
  {
    q: "Wie kann ich einen Transporter bei MyTransporter buchen?",
    a: "Die Buchung erfolgt komplett online über mytransporter.org. Du wählst Datum, Uhrzeit und Mietdauer (6 Stunden, 24 Stunden oder reine Kilometer-Abrechnung), verifizierst dich mit Führerschein und Ausweis und bezahlst direkt online. Anschließend holst du den Transporter in der Römerstraße 36, 71229 Leonberg ab.",
  },
  {
    q: "Was kostet die Transporter-Miete?",
    a: "Wir haben zwei Fahrzeugklassen: den kurzen L1H1 und den langen L4H2 (+10 € pro Miettag). L1H1: 3 Stunden 49 € (60 km inkl.), 6 Stunden 69 € (120 km), 24 Stunden 99 € (480 km), 189 € (500-km-Langstreckentarif) oder 299 € (800-km-Fernstreckentarif). Mehrtagestarife L1H1: 2 Tage 189 € (400 km), 3 Tage 269 € (600 km), 4 Tage 339 € (800 km), 5 Tage 399 € (1.000 km), 6 Tage 449 € (1.200 km), 7 Tage 499 € (1.400 km). L4H2 z. B.: 24 Stunden 109 €, 2 Tage 209 €, 7 Tage 569 €. Mehrkilometer kosten bei allen Tarifen 0,45 € pro Kilometer. Alternativ gibt es die reine Kilometer-Abrechnung zu 0,90 € pro Kilometer (Mindestbetrag L1H1 100 €, L4H2 110 €).",
  },
  {
    q: "Gibt es eine Kaution?",
    a: "Ja, die Kaution beträgt 200 €. Sie wird bei der Buchung über Stripe vorautorisiert und nach unbeschädigter, pünktlicher Rückgabe automatisch wieder freigegeben.",
  },
  {
    q: "Für welche Strecken kann ich den Transporter nutzen?",
    a: "Der Transporter ist ideal für Fahrten in Leonberg, Stuttgart, Böblingen, Sindelfingen, Ludwigsburg und der gesamten Region Baden-Württemberg. Auch bundesweite Fahrten innerhalb Deutschlands sind problemlos möglich, z. B. für Umzüge, Möbeltransporte, Kleinanzeigen-Abholungen oder Baumarkt-Touren.",
  },
  {
    q: "Ist der Transporter für Umzüge geeignet?",
    a: "Ja. Der lange L4H2 mit 6,36 m Länge und rund 1.200 kg Nutzlast ist perfekt für komplette Umzüge einer 2- bis 3-Zimmer-Wohnung. Für kleinere Transporte, Kleinanzeigen-Abholungen oder Baumarkt-Touren reicht meist der kurze L1H1 – er ist 10 € pro Miettag günstiger und leichter zu parken.",
  },
  {
    q: "Kann ich den Transporter kurzfristig mieten?",
    a: "Ja, kurzfristige Buchungen sind direkt online möglich, häufig auch noch am selben Tag. Solange ein freier Slot zwischen 08:00 und 22:00 Uhr verfügbar ist, kannst du den Transporter sofort buchen und abholen.",
  },
  {
    q: "Welche Voraussetzungen brauche ich für die Anmietung?",
    a: "Du musst mindestens 25 Jahre alt sein und einen gültigen Führerschein der Klasse B sowie einen Personalausweis oder Reisepass vorlegen. Die Verifizierung erfolgt bequem digital während der Buchung.",
  },
  {
    q: "Wo hole ich den Transporter ab?",
    a: "Abholung und Rückgabe erfolgen in der Römerstraße 36, 71229 Leonberg, verkehrsgünstig zwischen Stuttgart, Böblingen und Sindelfingen gelegen. Öffnungszeiten: täglich 08:00 bis 22:00 Uhr.",
  },
  {
    q: "Ist im Preis eine Versicherung enthalten?",
    a: "Die Fahrzeuge sind versichert. Im Schadenfall trägt der Mieter bis zu 1.000,00 € maximale Selbstbeteiligung. Ist der Schaden geringer, trägt er nur diesen geringeren Schaden. Die Ausnahmen aus § 9 der AGB (z. B. grobe Fahrlässigkeit, Alkohol, Falschbetankung) bleiben unberührt.",
  },
  {
    q: "Wie funktioniert die Tankregel?",
    a: "Es gilt Voll/Voll: Du erhältst das Fahrzeug vollgetankt und gibst es vollgetankt zurück. Der aktuelle Tankbeleg ist bei der Rückgabe in der App hochzuladen.",
  },
];

export const Route = createFileRoute("/faq")({
  head: () =>
    pageHead({
      path: "/faq",
      title: "FAQ: Transporter mieten in Leonberg – Buchung, Kaution, Preise | MyTransporter",
      description: "Antworten zu Buchung, Führerschein, Kaution, Tankregel, Umzug und kurzfristiger Transporter-Miete bei MyTransporter in Leonberg.",
      webPageType: "FAQPage",
      breadcrumbs: [{ name: "Start", path: "/" }, { name: "FAQ", path: "/faq" }],
      webPageExtra: {
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <AdRails>
      <div className="max-w-3xl mx-auto">
        <BrandHomeLink className="mb-8" imageClassName="h-8 w-auto" />
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
          Häufige Fragen, Transporter mieten in Leonberg & Stuttgart
        </h1>
        <p className="text-muted-foreground mb-10">
          Alles, was du zur Transporter-Vermietung bei MyTransporter wissen musst, von Buchung
          und Preisen über Kaution bis hin zu Umzug, Möbeltransport und kurzfristiger Miete in
          Leonberg, Stuttgart, Böblingen, Sindelfingen und Ludwigsburg.
        </p>

        <div className="space-y-4">
          {FAQS.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-border bg-card p-5 open:shadow-sm"
            >
              <summary className="cursor-pointer list-none font-medium text-foreground flex justify-between items-center gap-4">
                <span>{item.q}</span>
                <span className="text-muted-foreground text-xl leading-none transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>

        <section className="mt-12 p-6 rounded-2xl bg-secondary">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Noch Fragen? Wir sind für dich da.
          </h2>
          <p className="text-sm text-muted-foreground">
            Schreib uns an{" "}
            <a href="mailto:info@mytransporter.org" className="text-foreground underline">
              info@mytransporter.org
            </a>{" "}
            oder ruf uns an unter{" "}
            <a href="tel:+4915236230118" className="text-foreground underline">
              0152 3623 0118
            </a>
            . Wir helfen dir gerne weiter, persönlich, schnell und unkompliziert.
          </p>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8 text-center">
            Deine Transporter-Vermietung für Leonberg, Stuttgart & Umgebung
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {SEO_BLOCKS.map((b) => (
              <article key={b.h} className="p-6 rounded-2xl bg-card border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-2">{b.h}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.p}</p>
              </article>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Einsatzregion: Leonberg · Stuttgart · Böblingen · Sindelfingen · Ludwigsburg
            und gesamtes Baden-Württemberg.
          </p>
        </section>
        <RelatedLinks exclude="/faq" />
        <div className="mt-10 flex justify-center text-sm text-muted-foreground">
          <AdConsentRevokeButton />
        </div>
      </div>
    </AdRails>
    </main>
  );
}

const SEO_BLOCKS = [
  {
    h: "Transporter mieten in Leonberg",
    p: "MyTransporter ist deine lokale Transporter-Vermietung in Leonberg. Direkt in der Römerstraße 36 holst du deinen Transporter ab – kurzer L1H1 oder langer L4H2, ideal für Umzüge, Möbeltransporte oder spontane Fahrten in der Region. Buchung online, transparente Festpreise – Details auf der Preisseite.",
  },
  {
    h: "Transporter mieten in Stuttgart & Umgebung",
    p: "Auch für Kunden aus Stuttgart, Böblingen, Sindelfingen und Ludwigsburg sind wir die schnelle Alternative zu großen Mietwagen-Konzernen. Statt langer Schlangen am Schalter bekommst du den Transporter ohne Umweg, persönlich übergeben und einsatzbereit.",
  },
  {
    h: "Umzugswagen mieten, günstig & flexibel",
    p: "Mit 6,36 m Länge, rund 1.200 kg Nutzlast und Hochdach ist unser L4H2 ein vollwertiger Umzugswagen. Du transportierst den Inhalt einer 2- bis 3-Zimmer-Wohnung in einer Tour. Für kleinere Touren gibt es den kurzen L1H1 – 10 € pro Miettag günstiger. Perfekt für deinen Umzug in Leonberg, Stuttgart oder bundesweit.",
  },
  {
    h: "Möbeltransport, Baumarkt & Kleinanzeigen",
    p: "Ob Couch von Kleinanzeigen abholen, Baumaterial aus dem Baumarkt transportieren oder neue Möbel von IKEA holen, mit unserem Transporter bleibst du flexibel, ohne ein Auto zu besitzen.",
  },
  {
    h: "Kurzfristig buchen, auch heute noch",
    p: "Spontane Pläne? Kein Problem. Solange ein freier Slot zwischen 08:00 und 22:00 Uhr verfügbar ist, kannst du noch am selben Tag buchen, abholen und losfahren.",
  },
  {
    h: "Preise & Kaution, alles transparent",
    p: "Preise für den kurzen L1H1, der lange L4H2 kostet 10 € pro Miettag mehr: 3 Stunden 49 € (60 km), 6 Stunden 69 € (120 km), 24 Stunden 99 € (480 km), 189 € (500-km-Langstreckentarif) oder 299 € (800-km-Fernstreckentarif). Mehrtagestarife: 2 Tage 189 € (400 km), 3 Tage 269 € (600 km), 4 Tage 339 € (800 km), 5 Tage 399 € (1.000 km), 6 Tage 449 € (1.200 km), 7 Tage 499 € (1.400 km). Alternativ reine Kilometer-Abrechnung zu 0,90 € / km (Mindestbetrag 100 € bzw. 110 €). Mehrkilometer kosten bei allen Tarifen 0,45 € pro Kilometer. Die Kaution beträgt 200 € und wird nach unbeschädigter, sauberer und vollgetankter Rückgabe automatisch freigegeben. Keine versteckten Gebühren.",
  },
  {
    h: "Ablauf der Vermietung",
    p: "1. Online buchen und Verifizierung mit Führerschein & Ausweis. 2. Schlüssel in Leonberg abholen. 3. Fahrzeug-Check per App. 4. Losfahren. 5. Rückgabe, Tankbeleg hochladen, fertig. So einfach mietet man heute einen Transporter.",
  },
];