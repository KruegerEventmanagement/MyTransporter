import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";

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
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block">← Zurück</Link>
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
          </section>
          <section>
            <h2 className="font-bold text-lg mb-2">Was gelöscht wird</h2>
            <p>Anmeldekonto, Profildaten, hochgeladene Ausweis-/Führerscheindokumente und Mitteilungs-Registrierungen.</p>
            <p className="mt-2">Während einer laufenden oder bevorstehenden Miete ist die Löschung gesperrt. Buchungen und Rechnungen bewahren wir wegen gesetzlicher Aufbewahrungspflichten (bis zu 10 Jahre) auf.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
