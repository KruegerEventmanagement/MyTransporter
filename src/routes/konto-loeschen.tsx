import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { BrandHomeLink } from "@/components/BrandHomeLink";

export const Route = createFileRoute("/konto-loeschen")({
  head: () =>
    pageHead({
      path: "/konto-loeschen",
      title: "Konto löschen | MyTransporter",
      description: "So löschst du dein MyTransporter-Konto in der App oder auf der Website – und welche Daten wir aus gesetzlichen Gründen aufbewahren.",
      breadcrumbs: [{ name: "Start", path: "/" }, { name: "Konto löschen", path: "/konto-loeschen" }],
    }),
  component: KontoLoeschenPage,
});

function KontoLoeschenPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <BrandHomeLink className="mb-8" imageClassName="h-8 w-auto" />
        <h1 className="text-3xl font-bold text-foreground mb-8">Konto löschen</h1>
        <div className="space-y-6 text-sm text-foreground leading-relaxed">
          <section>
            <h2 className="font-bold text-lg mb-2">In der App oder auf der Website</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Anmelden und „Profil“ öffnen.</li>
              <li>Ganz unten „Konto löschen“ wählen und bestätigen.</li>
            </ol>
            <p className="mt-2">
              <Link to="/profil" hash="konto-loeschen" className="underline">Direkt zum Profil</Link>
            </p>
          </section>
          <section>
            <h2 className="font-bold text-lg mb-2">Ohne Anmeldung</h2>
            <p>Schreib uns von der hinterlegten E-Mail-Adresse an info@mytransporter.org mit dem Betreff „Konto löschen“.</p>
            <p className="mt-2">Passwort vergessen? Über „Passwort vergessen?“ im Login-Fenster bekommst du einen Link, mit dem du ein neues Passwort setzt und dich danach anmelden kannst.</p>
          </section>
          <section>
            <h2 className="font-bold text-lg mb-2">Was gelöscht wird</h2>
            <p>Endgültig gelöscht werden dein Anmeldekonto samt aller Sitzungen, deine Profildaten, Mitteilungs-Registrierungen und Geburtstagsaktionen. Das Konto wird nicht nur gesperrt.</p>
            <p className="mt-2">Ausweis- und Führerscheinkopien löschen wir sofort, sofern sie zu keinem Mietvertrag gehören. Gehören sie zu einem Mietvertrag, bleibt eine gesperrte Kopie nur für unser Team bis 90 Tage nach Vertragsende erhalten und wird danach automatisch gelöscht.</p>
            <p className="mt-2">Buchungen und Rechnungen bewahren wir getrennt wegen gesetzlicher Aufbewahrungspflichten (bis zu 10 Jahre) auf.</p>
            <p className="mt-2">Während einer laufenden oder bevorstehenden Miete nehmen wir deinen Löschantrag mit Zeitpunkt entgegen und löschen das Konto nach Abschluss der Miete. Es wird nichts heimlich storniert.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
