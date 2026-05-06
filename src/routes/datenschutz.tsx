import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/datenschutz")({
  head: () => ({
    meta: [
      { title: "Datenschutz – MyTransporter" },
      { name: "description", content: "Datenschutzerklärung der MyTransporter UG" },
    ],
  }),
  component: DatenschutzPage,
});

function DatenschutzPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block">← Zurück</Link>
        <h1 className="text-3xl font-bold text-foreground mb-8">Datenschutzerklärung</h1>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">1. Verantwortlicher</h2>
            <p>MyTransporter UG (haftungsbeschränkt)<br />Römerstraße 36, 71229 Leonberg<br />E-Mail: info@mytransporter.de<br />Telefon: 0152 3623 0118</p>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">2. Erhebung und Verarbeitung personenbezogener Daten</h2>
            <p>Wir erheben und verarbeiten personenbezogene Daten nur, soweit dies zur Bereitstellung unserer Dienstleistung erforderlich ist. Dies umfasst:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Name, E-Mail-Adresse, Telefonnummer (Registrierung)</li>
              <li>Führerschein- und Ausweisdaten (Identitätsprüfung)</li>
              <li>Zahlungsdaten (Abwicklung der Buchung)</li>
              <li>Standortdaten / GPS-Tracking (während der Mietdauer)</li>
              <li>Fotos des Fahrzeugs (Dokumentation vor/nach der Fahrt)</li>
            </ul>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">3. GPS-Tracking</h2>
            <p>Während der aktiven Mietdauer wird der Standort des Fahrzeugs in regelmäßigen Abständen (ca. alle 30 Sekunden) erfasst. Die Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am Diebstahlschutz). Die Daten werden nach Abschluss der Buchung für 90 Tage gespeichert und anschließend gelöscht.</p>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">4. Fotos und Dokumente</h2>
            <p>Fahrzeugfotos und eingescannte Dokumente (Führerschein, Ausweis, Tankbeleg) werden verschlüsselt gespeichert und ausschließlich zur Abwicklung des Mietverhältnisses verwendet. Löschung erfolgt 90 Tage nach Vertragsende.</p>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">5. Ihre Rechte</h2>
            <p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Kontaktieren Sie uns unter info@mytransporter.de.</p>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">6. Cookies</h2>
            <p>Unsere Website verwendet nur technisch notwendige Cookies zur Sitzungsverwaltung. Es werden keine Tracking- oder Marketing-Cookies eingesetzt.</p>
          </div>

          <p className="text-xs text-muted-foreground mt-8">Stand: Mai 2026</p>
        </div>
      </div>
    </main>
  );
}