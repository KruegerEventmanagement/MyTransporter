import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead, BUSINESS } from "@/lib/seo";
import { Navbar } from "@/components/Navbar";
import {
  DEPOSIT_EUR,
  EARLIEST_START_HOUR,
  KM_TARIFF_CENTS_PER_KM,
  KM_TARIFF_MIN_EUR,
  LATEST_RETURN_HOUR,
  LATEST_START_HOUR,
  PLAN_CATALOG,
  VEHICLE_CLASS_LABEL,
  extraKmCentsFor,
} from "@/lib/booking-rules";

/** Datum der tatsächlichen inhaltlichen Überarbeitung. */
const REVISED_ISO = "2026-10-06";
const REVISED_LABEL = "06.10.2026";

const eur = (cents: number) => (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €";
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const EXTRA_KM = extraKmCentsFor("l1h1", 1);
const P24 = PLAN_CATALOG.find((p) => p.id === "24h_300")!;
const DESCRIPTION =
  "Praktischer Ratgeber für deine Transportermiete bei MyTransporter: passendes Fahrzeug wählen, Mietdauer und Kilometer planen, Unterlagen, Buchungsablauf und Checkliste für Abholung und Rückgabe.";

export const Route = createFileRoute("/mietratgeber")({
  head: () =>
    pageHead({
      path: "/mietratgeber",
      title: "Mietratgeber: Transporter richtig planen, buchen und zurückgeben | MyTransporter",
      description: DESCRIPTION,
      ogType: "article",
      breadcrumbs: [{ name: "Start", path: "/" }, { name: "Mietratgeber", path: "/mietratgeber" }],
      webPageExtra: { dateModified: REVISED_ISO },
    }),
  component: MietratgeberPage,
});

const TOC = [
  ["fahrzeug", "Passendes Fahrzeug wählen"],
  ["dauer", "Mietdauer realistisch planen"],
  ["kilometer", "Kilometer berechnen"],
  ["unterlagen", "Unterlagen und Voraussetzungen"],
  ["ablauf", "So läuft die Buchung ab"],
  ["abholung", "Checkliste Abholung"],
  ["rueckgabe", "Checkliste Rückgabe"],
] as const;

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-12 scroll-mt-20 text-xl font-bold text-foreground md:text-2xl">
      {children}
    </h2>
  );
}

function MietratgeberPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-background pt-12">
      <Navbar />
      <article className="mx-auto max-w-3xl px-4 py-10 text-foreground">
        <h1 className="text-3xl font-bold text-balance md:text-4xl">Mietratgeber für deinen Transporter</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Zuletzt überarbeitet: <time dateTime={REVISED_ISO}>{REVISED_LABEL}</time>
        </p>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Diese Seite hilft dir, deine Miete bei MyTransporter vorab sauber zu planen. Verbindlich sind immer die
          Angaben in deiner konkret ausgewählten Buchung (Fahrzeug, Zeitraum, Inklusivkilometer, Abholort) sowie unsere{" "}
          <Link to="/agb" className="underline">AGB</Link>.
        </p>

        <nav aria-label="Inhalt" className="mt-6 rounded-2xl border border-border bg-secondary/40 p-4">
          <p className="text-sm font-semibold">Inhalt</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="underline underline-offset-2">{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <H2 id="fahrzeug">1. Passendes Fahrzeug wählen</H2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Wir vermieten Transporter in den Klassen {VEHICLE_CLASS_LABEL.l1h1}, {VEHICLE_CLASS_LABEL.l4h2} und{" "}
          {VEHICLE_CLASS_LABEL.l5h2}. Welche Fahrzeuge zu deinem Zeitraum frei sind und welche Maße, Nutzlast und
          Türöffnungen für sie hinterlegt sind, siehst du bei der Fahrzeugauswahl in der Buchung.
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>Miss das längste und das höchste Stück (z. B. Schrank, Sofa, Matratze) und vergleiche es mit Laderaumlänge, Laderaumhöhe und Hecktür.</li>
          <li>Prüfe das Gewicht: Schwere Ladung wie Waschmaschine, Bücherkisten oder Baumaterial zählt gegen die Nutzlast.</li>
          <li>Zerlegbare Möbel vorher abbauen – das spart Platz und verringert Schäden.</li>
          <li>Ist ein Wert in der Auswahl als „noch nicht bestätigt“ gekennzeichnet, plane mit Reserve oder frag uns vorher.</li>
        </ul>

        <H2 id="dauer">2. Mietdauer realistisch planen</H2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Abholungen sind laut Buchungssystem zwischen {hh(EARLIEST_START_HOUR)} und {hh(LATEST_START_HOUR)} Uhr möglich,
          Rückgaben bis {hh(LATEST_RETURN_HOUR)} Uhr. Welche Tarife zu deiner Startzeit passen, zeigt dir die Buchung.
          Rechne nicht nur die reine Fahrzeit, sondern alle Schritte:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>Weg zum Abholort, Fahrzeugfotos und Übernahme</li>
          <li>Hinfahrt zur Ladestelle und Beladen (Treppen, Aufzug, Parkplatz)</li>
          <li>Fahrt zum Ziel, Entladen, ggf. mehrere Fahrten</li>
          <li>Tanken vor der Rückgabe, Rückfahrt zum Abholort, Rückgabefotos</li>
        </ul>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Plane einen Zeitpuffer ein. Wird es knapp, ist ein längerer Tarif meist entspannter als eine verspätete
          Rückgabe. Alle Tarife findest du unter <Link to="/preise" className="underline">Tarife &amp; Preise</Link>.
        </p>

        <H2 id="kilometer">3. Kilometer berechnen</H2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Jeder Zeittarif enthält Inklusivkilometer (z. B. {P24.label}: {P24.freeKm} km). Gezählt wird die gesamte
          Strecke vom Abholort bis zur Rückgabe – also auch die Fahrt zur Ladestelle und zurück zum Abholort.
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>Abholort → Ladestelle</li>
          <li>Ladestelle → Ziel (bei mehreren Fahrten entsprechend mehrfach)</li>
          <li>Ziel → Tankstelle → Abholort</li>
          <li>Summe plus etwas Reserve für Umwege</li>
        </ol>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Mehrkilometer kosten aktuell {eur(EXTRA_KM)} pro Kilometer. Alternativ gibt es eine reine
          Kilometer-Abrechnung zu {eur(KM_TARIFF_CENTS_PER_KM)} pro Kilometer (Mindestbetrag {KM_TARIFF_MIN_EUR.l1h1} €
          beim L1H1). Maßgeblich sind die Werte, die dir beim Buchen angezeigt werden.
        </p>

        <H2 id="unterlagen">4. Unterlagen und Voraussetzungen</H2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>Mindestalter 25 Jahre</li>
          <li>Gültiger Führerschein der Klasse B</li>
          <li>Gültiger Personalausweis oder Reisepass</li>
          <li>Die Identitätsprüfung erfolgt digital: Du fotografierst bzw. lädst die Dokumente bei der Buchung hoch.</li>
          <li>Eine Kaution von {DEPOSIT_EUR} € wird bei der Zahlung vorautorisiert und nach ordnungsgemäßer Rückgabe freigegeben.</li>
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          Wie wir mit deinen Dokumenten umgehen, steht in der <Link to="/datenschutz" className="underline">Datenschutzerklärung</Link>.
        </p>

        <H2 id="ablauf">5. So läuft die Buchung ab</H2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>Auf der <Link to="/" className="underline">Startseite</Link> Datum, Uhrzeit und Tarif wählen.</li>
          <li>Freies Fahrzeug auswählen – angezeigt werden nur Fahrzeuge, die im Zeitraum verfügbar sind.</li>
          <li>Anmelden oder Konto erstellen und Führerschein sowie Ausweis hinterlegen.</li>
          <li>Online bezahlen; die Kaution wird dabei vorautorisiert.</li>
          <li>Du erhältst eine Buchungsbestätigung mit Rechnung. Abholort und Zeitraum stehen in deiner Buchung.</li>
        </ol>

        <H2 id="abholung">6. Checkliste Abholung</H2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>Pünktlich am Abholort aus deiner Buchung sein. Unsere Abholorte: {BUSINESS.leonberg.street},{" "}
            {BUSINESS.leonberg.postalCode} {BUSINESS.leonberg.locality} sowie für den extra langen Crafter{" "}
            {BUSINESS.grunbach.street}, {BUSINESS.grunbach.postalCode} {BUSINESS.grunbach.locality}.</li>
          <li>Vor Fahrtantritt das Fahrzeug von allen Seiten fotografieren und den Kilometerstand dokumentieren.</li>
          <li>Vorhandene Schäden sofort melden, bevor du losfährst.</li>
          <li>Ladung mit Gurten sichern; schwere Teile nach unten und nah an die Trennwand.</li>
        </ul>

        <H2 id="rueckgabe">7. Checkliste Rückgabe</H2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>Es gilt Voll/Voll: Fahrzeug vollgetankt zurückgeben und den aktuellen Tankbeleg aufbewahren.</li>
          <li>Laderaum leeren und grob reinigen, persönliche Gegenstände mitnehmen.</li>
          <li>In der App führt dich die Rückgabe Schritt für Schritt durch die Fotos: Fahrzeug außen von allen Seiten,
            Innenraum, Instrumente mit Kilometer- und Tankstand auf einem Foto sowie der Tankbeleg.</li>
          <li>Rückgabe rechtzeitig vor Ende deines Zeitraums abschließen. Wie der Schlüssel zurückgegeben wird, steht in deiner Buchung.</li>
        </ul>

        <section className="mt-12 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold">Noch Fragen?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Antworten auf häufige Fragen findest du in den <Link to="/faq" className="underline">FAQ</Link>. Bei
            Unklarheiten zu deiner konkreten Buchung erreichst du uns über{" "}
            <Link to="/kontakt" className="underline">Kontakt</Link>, per Telefon{" "}
            <a href={`tel:${BUSINESS.phone}`} className="underline">{BUSINESS.phoneDisplay}</a> oder E-Mail{" "}
            <a href={`mailto:${BUSINESS.email}`} className="underline">{BUSINESS.email}</a>.
          </p>
        </section>
      </article>
      <footer className="border-t border-border py-12 text-center text-sm text-muted-foreground">
        <p>© 2026 MyTransporter. Alle Rechte vorbehalten.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-4">
          <Link to="/" className="hover:text-foreground">Startseite</Link>
          <Link to="/preise" className="hover:text-foreground">Tarife &amp; Preise</Link>
          <Link to="/faq" className="hover:text-foreground">FAQ</Link>
          <Link to="/kontakt" className="hover:text-foreground">Kontakt</Link>
          <Link to="/agb" className="hover:text-foreground">AGB</Link>
          <Link to="/impressum" className="hover:text-foreground">Impressum</Link>
          <Link to="/datenschutz" className="hover:text-foreground">Datenschutz</Link>
        </div>
      </footer>
    </main>
  );
}
