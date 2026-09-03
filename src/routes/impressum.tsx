import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/impressum")({
  head: () => ({
    meta: [
      { title: "Impressum, MyTransporter" },
      { name: "description", content: "Impressum der MyTransporter UG (haftungsbeschränkt)" },
    ],
  }),
  component: ImpressumPage,
});

function ImpressumPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block">← Zurück</Link>
        <h1 className="text-3xl font-bold text-foreground mb-8">Impressum</h1>

        <div className="space-y-6 text-sm text-foreground leading-relaxed">
          <div>
            <h2 className="font-bold text-lg mb-2">Angaben gemäß § 5 TMG</h2>
            <p>MyTransporter UG (haftungsbeschränkt)</p>
            <p>Römerstraße 36</p>
            <p>71229 Leonberg</p>
          </div>

          <div>
            <h2 className="font-bold text-lg mb-2">Vertreten durch</h2>
            <p>Geschäftsführer: Christian Krüger</p>
          </div>

          <div>
            <h2 className="font-bold text-lg mb-2">Kontakt</h2>
            <p>Telefon: 0152 3623 0118</p>
            <p>E-Mail: info@mytransporter.org</p>
          </div>

          <div>
            <h2 className="font-bold text-lg mb-2">Umsatzsteuer-ID</h2>
            <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz:</p>
            <p>DE328715703</p>
          </div>

          <div>
            <h2 className="font-bold text-lg mb-2">Haftungsausschluss</h2>
            <h3 className="font-medium mt-3 mb-1">Haftung für Inhalte</h3>
            <p className="text-muted-foreground">
              Die Inhalte unserer Seiten wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen. Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen.
            </p>
            <h3 className="font-medium mt-3 mb-1">Haftung für Links</h3>
            <p className="text-muted-foreground">
              Unser Angebot enthält Links zu externen Webseiten Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}