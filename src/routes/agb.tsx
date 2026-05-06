import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/agb")({
  head: () => ({
    meta: [
      { title: "AGB – MyTransporter" },
      { name: "description", content: "Allgemeine Geschäftsbedingungen der MyTransporter UG" },
    ],
  }),
  component: AgbPage,
});

function AgbPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block">← Zurück</Link>
        <h1 className="text-3xl font-bold text-foreground mb-8">Allgemeine Geschäftsbedingungen</h1>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">§ 1 Geltungsbereich</h2>
            <p>Diese Allgemeinen Geschäftsbedingungen gelten für alle Mietverträge zwischen der MyTransporter UG (haftungsbeschränkt), Römerstraße 36, 71229 Leonberg (nachfolgend „Vermieter") und dem Mieter über die Anmietung von Transportfahrzeugen.</p>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">§ 2 Mietbedingungen</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Das Mindestalter des Mieters beträgt 25 Jahre.</li>
              <li>Ein gültiger Führerschein der Klasse B ist erforderlich.</li>
              <li>Ein gültiger Personalausweis oder Reisepass muss vorgelegt werden.</li>
              <li>Die Identitätsprüfung erfolgt digital über unsere App.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">§ 3 Kaution</h2>
            <p>Bei Anmietung wird eine Kaution in Höhe von 200 € erhoben. Diese wird nach ordnungsgemäßer Rückgabe des Fahrzeugs und Prüfung auf Schäden zurückerstattet.</p>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">§ 4 Preise und Tarife</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>6-Stunden-Tarif: 100 € (Rückgabe bis spätestens 22:00 Uhr)</li>
              <li>24-Stunden-Tarif: 150 € (Rückgabe zwischen 08:00 und 22:00 Uhr)</li>
              <li>Kilometer-Tarif: 0,90 € pro gefahrenem Kilometer (Mindestbetrag 100 €)</li>
            </ul>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">§ 5 Gebühren und Strafen</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Verspätete Rückgabe: 25 € pro angefangene Stunde</li>
              <li>Rauchen im Fahrzeug: 100 € Reinigungsgebühr</li>
              <li>Schäden am Fahrzeug werden in voller Höhe berechnet</li>
              <li>Nicht vollgetanktes Fahrzeug: Betankungskosten zzgl. 20 € Servicegebühr</li>
            </ul>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">§ 6 Fahrzeugübernahme und -rückgabe</h2>
            <p>Die Schlüsselübergabe erfolgt in der Römerstraße 36, 71229 Leonberg. Vor Fahrtantritt ist das Fahrzeug von allen Seiten zu fotografieren und der Kilometerstand zu dokumentieren. Bei Rückgabe sind erneut Fotos, der aktuelle Kilometerstand sowie der Tankbeleg einzureichen.</p>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">§ 7 Pflichten des Mieters</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sorgfältige Behandlung des Fahrzeugs</li>
              <li>Absolutes Rauchverbot im Fahrzeug</li>
              <li>Rückgabe mit vollem Tank (Tankbeleg erforderlich)</li>
              <li>Rückgabe innerhalb der vereinbarten Mietdauer</li>
              <li>Unverzügliche Meldung von Schäden oder Unfällen</li>
            </ul>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">§ 8 GPS-Tracking</h2>
            <p>Während der Mietdauer wird der Standort des Fahrzeugs per GPS aufgezeichnet. Dies dient der Sicherheit und dem Diebstahlschutz. Die Daten werden gemäß unserer Datenschutzerklärung verarbeitet.</p>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">§ 9 Schlussbestimmungen</h2>
            <p>Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist Leonberg. Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</p>
          </div>

          <p className="text-xs text-muted-foreground mt-8">Stand: Mai 2026</p>
        </div>
      </div>
    </main>
  );
}