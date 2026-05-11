import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { HeroSection } from "@/components/HeroSection";
import { BookingSection } from "@/components/BookingSection";
import { Navbar } from "@/components/Navbar";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Transporter mieten in Leonberg & Stuttgart | MyTransporter" },
      {
        name: "description",
        content:
          "Günstige und flexible Transporter-Vermietung in Leonberg, Stuttgart und Umgebung. Ideal für Umzug, Möbeltransport, Kleinanzeigen-Abholung, Baumarkt und kurzfristige Fahrten.",
      },
      { name: "robots", content: "index,follow" },
      { name: "geo.region", content: "DE-BW" },
      { name: "geo.placename", content: "Leonberg, Stuttgart" },
      { property: "og:title", content: "Transporter mieten in Leonberg & Stuttgart | MyTransporter" },
      {
        property: "og:description",
        content:
          "Günstige Transporter-Vermietung in Leonberg, Stuttgart, Böblingen, Sindelfingen und Ludwigsburg. Online buchen ab 100 € – ideal für Umzug, Möbeltransport und kurzfristige Fahrten.",
      },
      { property: "og:locale", content: "de_DE" },
      { rel: "canonical", href: "https://www.mytransporter.org/" } as never,
    ],
    links: [{ rel: "canonical", href: "https://www.mytransporter.org/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AutoRental",
          name: "MyTransporter",
          image: "https://www.mytransporter.org/icons/icon-192.png",
          url: "https://www.mytransporter.org/",
          telephone: "+4915236230118",
          email: "info@mytransporter.de",
          priceRange: "€€",
          address: {
            "@type": "PostalAddress",
            streetAddress: "Römerstraße 36",
            postalCode: "71229",
            addressLocality: "Leonberg",
            addressRegion: "BW",
            addressCountry: "DE",
          },
          areaServed: ["Leonberg", "Stuttgart", "Böblingen", "Sindelfingen", "Ludwigsburg"],
          openingHoursSpecification: {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
            opens: "08:00",
            closes: "22:00",
          },
        }),
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background pt-12">
      <Navbar />
      <HeroSection />
      <h1 className="sr-only">Transporter mieten in Leonberg & Stuttgart</h1>
      <BookingSection />
      <SeoContent />
      <footer className="py-12 text-center text-sm text-muted-foreground border-t border-border">
        <p>© 2026 MyTransporter. Alle Rechte vorbehalten.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-4">
          <Link to="/impressum" className="hover:text-foreground transition-colors">Impressum</Link>
          <Link to="/agb" className="hover:text-foreground transition-colors">AGB</Link>
          <Link to="/datenschutz" className="hover:text-foreground transition-colors">Datenschutz</Link>
          <Link to="/kontakt" className="hover:text-foreground transition-colors">Kontakt</Link>
          <Link to="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
        </div>
      </footer>
    </main>
  );
}

function SeoContent() {
  const blocks = [
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

  return (
    <section className="py-20 px-4 border-t border-border">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8 text-center">
          Deine Transporter-Vermietung für Leonberg, Stuttgart & Umgebung
        </h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {blocks.map((b) => (
            <article key={b.h} className="p-6 rounded-2xl bg-card border border-border">
              <h3 className="text-lg font-semibold text-foreground mb-2">{b.h}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{b.p}</p>
            </article>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Einsatzregion: Leonberg · Stuttgart · Böblingen · Sindelfingen · Ludwigsburg und
          gesamtes Baden-Württemberg.
        </p>
        <div className="mt-10 text-center">
          <Link
            to="/faq"
            className="inline-block px-6 py-3 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition"
          >
            Häufige Fragen ansehen
          </Link>
        </div>
      </div>
    </section>
  );
}
