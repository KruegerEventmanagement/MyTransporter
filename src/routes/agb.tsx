import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/agb")({
  head: () => ({
    meta: [
      { title: "AGB, MyTransporter" },
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
            <p>Bei Anmietung wird eine Kaution in Höhe von 200 € erhoben. Sie wird über Stripe vorautorisiert und nach ordnungsgemäßer Rückgabe des Fahrzeugs vollständig freigegeben.</p>
            <p className="mt-2">Die Kaution dient ausdrücklich zur Absicherung folgender Fälle und kann hierfür ganz oder anteilig einbehalten werden:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Verschmutzte Rückgabe des Fahrzeugs (innen oder außen), die eine Reinigung erforderlich macht.</li>
              <li>Rückgabe ohne vollen Tank oder ohne gültigen Tankbeleg.</li>
              <li>Fehlende oder entwendete Ausstattung, insbesondere FM-Transmitter bzw. Bluetooth-Audiogerät, Spanngurte, Warndreieck, Warnweste, Verbandskasten, Ladekabel oder vergleichbares Zubehör.</li>
              <li>Sonstige geringfügige Beschädigungen oder Vertragsverstöße, die im Rahmen der Kautionssumme abgegolten werden können.</li>
            </ul>
            <p className="mt-2">Übersteigt der Schaden oder die entstandenen Kosten die Kautionshöhe, bleibt die Geltendmachung des darüber hinausgehenden Betrags ausdrücklich vorbehalten.</p>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">§ 4 Preise und Tarife</h2>
            <p className="mb-2">Alle Preise verstehen sich in Euro und enthalten die gesetzliche Umsatzsteuer von 19 %. Die Mietpreise gelten je gebuchtem Mietzeitraum und Transporter inklusive der angegebenen Freikilometer.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>3-Stunden-Tarif „Express": 49 € inklusive 100 Freikilometern (Rückgabe nach 3 Stunden).</li>
              <li>6-Stunden-Tarif „Umzug Mini": 69 € inklusive 200 Freikilometern (Rückgabe nach 6 Stunden).</li>
              <li>24-Stunden-Tarif „Umzugstag": 99 € inklusive 300 Freikilometern (Rückgabe am Folgetag zur gleichen Uhrzeit).</li>
              <li>24-Stunden-Tarif „Langstrecke": 129 € inklusive 500 Freikilometern (Rückgabe am Folgetag zur gleichen Uhrzeit).</li>
              <li>2-Tage-Tarif „Kurzprojekt": 169 € inklusive 600 Freikilometern.</li>
              <li>3-Tage-Tarif „Umzug Plus": 229 € inklusive 900 Freikilometern.</li>
              <li>4-Tage-Tarif „Renovierungs-Tarif": 299 € inklusive 1.100 Freikilometern.</li>
              <li>5-Tage-Tarif „Projektwoche Mini": 359 € inklusive 1.300 Freikilometern.</li>
              <li>6-Tage-Tarif „Projektwoche": 409 € inklusive 1.400 Freikilometern.</li>
              <li>7-Tage-Tarif „Wochenmiete": 459 € inklusive 1.500 Freikilometern.</li>
              <li>Jeder über das jeweilige Freikilometer-Kontingent hinaus gefahrene Kilometer wird mit 0,39 € berechnet; bei Mehrtagestarifen ab 2 Tagen mit 0,35 €, bei der 7-Tage-Wochenmiete mit 0,29 €.</li>
              <li>Reiner Kilometer-Tarif: 0,90 € pro gefahrenem Kilometer (Mindestbetrag 100 €).</li>
              <li>Optionale Zusatzpakete: „Sicher-Transport Paket" 19 €, „Profi-Umzug Paket" 49 €.</li>
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
            <h2 className="font-bold text-lg text-foreground mb-2">§ 9 Versicherung und Haftung</h2>
            <p className="mb-2"><strong>Versicherungsschutz:</strong> Das Mietfahrzeug ist kraftfahrzeug-haftpflichtversichert. Im Schadenfall trägt der Mieter bis zu 1.000,00 Euro maximale Selbstbeteiligung. Ist der Schaden geringer, trägt er nur diesen geringeren Schaden.</p>
            <p className="mb-2"><strong>Haftung bei selbstverschuldeten Schäden:</strong> Der Mieter haftet für alle während der Mietzeit durch ihn oder einen berechtigten Fahrer schuldhaft verursachten Schäden am Mietfahrzeug nach den gesetzlichen Vorschriften. Bei erheblichen selbstverschuldeten Schäden am Mietfahrzeug, insbesondere Unfall-, Karosserie-, Front-, Heck-, Dach-, Unterboden-, Tür-, Leuchten-, Spiegel-, Verkleidungs-, Innenraum- oder Ladegutschäden, haftet der Mieter bei einfacher Fahrlässigkeit für den tatsächlich entstandenen Fahrzeugschaden bis zu einem Höchstbetrag von 1.000,00 Euro pro Schadensfall. Ist der tatsächlich entstandene Fahrzeugschaden geringer, ist nur der geringere tatsächliche Schaden zu ersetzen. Die Schadenshöhe kann insbesondere durch Rechnung, Kostenvoranschlag, Gutachten oder sonstige geeignete Nachweise festgestellt werden.</p>
            <p className="mb-2"><strong>Nebenkosten des Schadensfalls:</strong> Zusätzlich zum Fahrzeugschaden trägt der Mieter alle durch den Schadensfall verursachten notwendigen Nebenkosten, insbesondere Abschleppkosten, Bergungskosten, Standkosten, Sicherstellungskosten, Gutachterkosten, Rückführungskosten, Reinigungs- und Entsorgungskosten sowie behördliche Gebühren, soweit diese Kosten durch den Mieter oder einen berechtigten Fahrer schuldhaft verursacht wurden und tatsächlich angefallen sind. Dem Mieter bleibt ausdrücklich der Nachweis gestattet, dass kein Schaden, ein wesentlich geringerer Schaden oder geringere Nebenkosten entstanden sind.</p>
            <p className="mb-2"><strong>Ausnahme bei grobem Fehlverhalten:</strong> Bei vorsätzlicher oder grob fahrlässiger Schadensverursachung, Alkohol- oder Drogeneinfluss, Unfallflucht, unerlaubter Fahrerüberlassung, Überladung, Falschbetankung, Nutzung entgegen dem Mietvertrag oder Verletzung der Unfallmeldepflichten haftet der Mieter nach den gesetzlichen Vorschriften bis zur vollen Schadenshöhe. Die Begrenzung auf 1.000,00 Euro gilt in diesen Fällen nicht.</p>
            <p>Die Kaution beträgt 200 Euro. Die Kaution ist keine Haftungsbegrenzung. Offene Forderungen, insbesondere Reinigung, Nachbetankung, Mehrkilometer, Schäden, Bußgelder, Bearbeitungskosten oder sonstige Nachbelastungen, können mit der Kaution verrechnet werden. Übersteigende Beträge bleiben zusätzlich zahlbar.</p>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">§ 10 Schlussbestimmungen</h2>
            <p>Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist Leonberg. Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</p>
          </div>

          <p className="text-xs text-muted-foreground mt-8">Stand: Juni 2026</p>
        </div>
      </div>
    </main>
  );
}