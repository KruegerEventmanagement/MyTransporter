import { createFileRoute, Link } from "@tanstack/react-router";

const FAQS = [
  {
    q: "Wie kann ich einen Transporter bei MyTransporter buchen?",
    a: "Die Buchung erfolgt komplett online über mytransporter.org. Du wählst Datum, Uhrzeit und Mietdauer (6 Stunden, 24 Stunden oder reine Kilometer-Abrechnung), verifizierst dich mit Führerschein und Ausweis und bezahlst direkt online. Anschließend holst du den Transporter in der Römerstraße 36, 71229 Leonberg ab.",
  },
  {
    q: "Was kostet die Transporter-Miete?",
    a: "Bei MyTransporter mietest du einen Fiat Ducato L4H2 ab 100 € für 6 Stunden oder 150 € für 24 Stunden. Alternativ gibt es eine reine Kilometer-Abrechnung zu 0,90 € pro Kilometer. Die Preise sind transparent, ohne versteckte Kosten und ideal für günstige Umzüge in Leonberg, Stuttgart und Umgebung.",
  },
  {
    q: "Gibt es eine Kaution?",
    a: "Ja, die Kaution beträgt 200 €. Sie wird bei der Buchung über Stripe vorautorisiert und nach unbeschädigter, pünktlicher Rückgabe automatisch wieder freigegeben.",
  },
  {
    q: "Für welche Strecken kann ich den Transporter nutzen?",
    a: "Der Transporter ist ideal für Fahrten in Leonberg, Stuttgart, Böblingen, Sindelfingen, Ludwigsburg und der gesamten Region Baden-Württemberg. Auch bundesweite Fahrten innerhalb Deutschlands sind problemlos möglich – z. B. für Umzüge, Möbeltransporte, Kleinanzeigen-Abholungen oder Baumarkt-Touren.",
  },
  {
    q: "Ist der Transporter für Umzüge geeignet?",
    a: "Ja, der Fiat Ducato L4H2 mit 6,36 m Länge und 1.200 kg Nutzlast ist perfekt für Umzüge geeignet. Du transportierst Sofas, Schränke, Betten oder komplette Haushalte einer 2- bis 3-Zimmer-Wohnung in einer Tour. Ein klassischer Umzugswagen zum kleinen Preis.",
  },
  {
    q: "Kann ich den Transporter kurzfristig mieten?",
    a: "Ja, kurzfristige Buchungen sind direkt online möglich – häufig auch noch am selben Tag. Solange ein freier Slot zwischen 08:00 und 22:00 Uhr verfügbar ist, kannst du den Transporter sofort buchen und abholen.",
  },
  {
    q: "Welche Voraussetzungen brauche ich für die Anmietung?",
    a: "Du musst mindestens 25 Jahre alt sein und einen gültigen Führerschein der Klasse B sowie einen Personalausweis oder Reisepass vorlegen. Die Verifizierung erfolgt bequem digital während der Buchung.",
  },
  {
    q: "Wo hole ich den Transporter ab?",
    a: "Abholung und Rückgabe erfolgen in der Römerstraße 36, 71229 Leonberg – verkehrsgünstig zwischen Stuttgart, Böblingen und Sindelfingen gelegen. Öffnungszeiten: täglich 08:00 bis 22:00 Uhr.",
  },
  {
    q: "Ist im Preis eine Versicherung enthalten?",
    a: "Ja, der Transporter ist haftpflicht- und vollkaskoversichert (mit Selbstbeteiligung). Du fährst rundum abgesichert los.",
  },
  {
    q: "Muss ich vollgetankt zurückgeben?",
    a: "Der Transporter muss mit dem gleichen Tankstand zurückgegeben werden, mit dem du ihn übernommen hast. Den Tankbeleg lädst du einfach in der App hoch.",
  },
];

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ – Transporter mieten in Leonberg & Stuttgart | MyTransporter" },
      {
        name: "description",
        content:
          "Häufige Fragen zur Transporter-Vermietung in Leonberg, Stuttgart, Böblingen, Sindelfingen und Ludwigsburg: Buchung, Preise, Kaution, Umzug, kurzfristige Miete.",
      },
      { property: "og:title", content: "FAQ – Transporter mieten in Leonberg & Stuttgart" },
      {
        property: "og:description",
        content:
          "Antworten auf alle Fragen rund um Buchung, Preis, Kaution, Umzug und kurzfristige Anmietung deines Transporters bei MyTransporter.",
      },
      { name: "robots", content: "index,follow" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block"
        >
          ← Zurück
        </Link>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
          Häufige Fragen – Transporter mieten in Leonberg & Stuttgart
        </h1>
        <p className="text-muted-foreground mb-10">
          Alles, was du zur Transporter-Vermietung bei MyTransporter wissen musst – von Buchung
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
            <a href="mailto:info@mytransporter.de" className="text-foreground underline">
              info@mytransporter.de
            </a>{" "}
            oder ruf uns an unter{" "}
            <a href="tel:+4915236230118" className="text-foreground underline">
              0152 3623 0118
            </a>
            . Wir helfen dir gerne weiter – persönlich, schnell und unkompliziert.
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
      </div>
    </main>
  );
}

const SEO_BLOCKS = [
  {
    h: "Transporter mieten in Leonberg",
    p: "MyTransporter ist deine lokale Transporter-Vermietung in Leonberg. Direkt in der Römerstraße 36 holst du deinen Fiat Ducato L4H2 ab – ideal für Umzüge, Möbeltransporte oder spontane Fahrten in der Region. Buchung online in unter 2 Minuten, transparente Preise ab 100 €.",
  },
  {
    h: "Transporter mieten in Stuttgart & Umgebung",
    p: "Auch für Kunden aus Stuttgart, Böblingen, Sindelfingen und Ludwigsburg sind wir die schnelle Alternative zu großen Mietwagen-Konzernen. Statt langer Schlangen am Schalter bekommst du den Transporter ohne Umweg – persönlich übergeben, vollgetankt und einsatzbereit.",
  },
  {
    h: "Umzugswagen mieten – günstig & flexibel",
    p: "Mit 6,36 m Länge, 1.200 kg Nutzlast und Hochdach ist unser Transporter ein vollwertiger Umzugswagen. Du transportierst den Inhalt einer 2- bis 3-Zimmer-Wohnung in einer Tour. Perfekt für deinen Umzug in Leonberg, Stuttgart oder bundesweit.",
  },
  {
    h: "Möbeltransport, Baumarkt & Kleinanzeigen",
    p: "Ob Couch von Kleinanzeigen abholen, Baumaterial aus dem Baumarkt transportieren oder neue Möbel von IKEA holen – mit unserem Transporter bleibst du flexibel, ohne ein Auto zu besitzen.",
  },
  {
    h: "Kurzfristig buchen – auch heute noch",
    p: "Spontane Pläne? Kein Problem. Solange ein freier Slot zwischen 08:00 und 22:00 Uhr verfügbar ist, kannst du noch am selben Tag buchen, abholen und losfahren.",
  },
  {
    h: "Preise & Kaution – alles transparent",
    p: "6 Stunden für 100 €, 24 Stunden für 150 € oder reine Kilometer-Abrechnung zu 0,90 € / km. Die Kaution beträgt 200 € und wird nach unbeschädigter Rückgabe automatisch freigegeben. Keine versteckten Gebühren.",
  },
  {
    h: "Ablauf der Vermietung",
    p: "1. Online buchen und Verifizierung mit Führerschein & Ausweis. 2. Schlüssel in Leonberg abholen. 3. Fahrzeug-Check per App. 4. Losfahren. 5. Rückgabe, Tankbeleg hochladen – fertig. So einfach mietet man heute einen Transporter.",
  },
];