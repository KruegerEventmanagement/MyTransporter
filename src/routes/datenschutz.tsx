import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { openConsentSettings } from "@/components/CookieConsent";
import { BrandHomeLink } from "@/components/BrandHomeLink";

export const Route = createFileRoute("/datenschutz")({
  head: () =>
    pageHead({
      path: "/datenschutz",
      title: "Datenschutzerklärung | MyTransporter",
      description: "Datenschutzerklärung von MyTransporter: welche Daten bei Buchung, Verifizierung und Zahlung verarbeitet werden.",
      breadcrumbs: [{ name: "Start", path: "/" }, { name: "Datenschutz", path: "/datenschutz" }],
    }),
  component: DatenschutzPage,
});

function DatenschutzPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <BrandHomeLink className="mb-8" imageClassName="h-8 w-auto" />
        <h1 className="text-3xl font-bold text-foreground mb-8">Datenschutzerklärung</h1>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">1. Verantwortlicher</h2>
            <p>MyTransporter<br />Inhaber: Christian Krüger<br />Römerstraße 36, 71229 Leonberg<br />E-Mail: info@mytransporter.org<br />Telefon: 0152 3623 0118</p>
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
            <p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Kontaktieren Sie uns unter info@mytransporter.org.</p>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">6. Cookies und Einwilligung</h2>
            <p>Technisch notwendige Cookies und Speichereinträge verwenden wir für Login, Buchung und Zahlungsabwicklung. Sie sind zur Bereitstellung der Website erforderlich (Art. 6 Abs. 1 lit. b DSGVO) und werden ohne Einwilligung gesetzt.</p>
            <p className="mt-2">Marketing-Cookies werden ausschließlich nach ausdrücklicher Einwilligung gesetzt (Art. 6 Abs. 1 lit. a DSGVO). Ohne Einwilligung wird kein Marketing- oder Trackingdienst geladen.</p>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">7. Google Ads Conversion-Tracking</h2>
            <p>Mit Ihrer Einwilligung setzen wir Google Ads Conversion-Tracking (Google Ireland Limited) ein. Zweck ist die Messung, ob eine über eine Google-Anzeige begonnene Sitzung zu einer abgeschlossenen, bezahlten Buchung geführt hat. Übermittelt werden dabei ein pseudonymer Klick-Identifier, der Buchungswert (Mietpreis inkl. gebuchtem Umzugspaket, ohne die rückzahlbare Kaution), die Währung und eine eindeutige Transaktionskennung. Es werden keine Namen, E-Mail-Adressen oder Dokumentendaten an Google übermittelt.</p>
            <p className="mt-2">Wir nutzen den Google Consent Mode v2: Die Signale <em>ad_storage</em>, <em>analytics_storage</em>, <em>ad_user_data</em> und <em>ad_personalization</em> sind standardmäßig auf „denied“ gesetzt und werden erst nach Ihrer Einwilligung auf „granted“ gesetzt. Eine Datenübermittlung in die USA kann nicht ausgeschlossen werden.</p>
            <p className="mt-2">Ebenfalls nur mit Ihrer Einwilligung setzen wir den Meta-Pixel (Meta Platforms Ireland Ltd.) ein, um Registrierungen und bezahlte Buchungen unseren Anzeigen zuzuordnen. Übermittelt werden ausschließlich das Ereignis, der Buchungswert ohne Kaution, die Währung sowie eine pseudonyme Ereignis-Kennung. Namen, E-Mail-Adressen, Telefonnummern, Ausweis- oder Führerscheindaten und Fahrzeugfotos werden nicht übermittelt. Ohne Einwilligung wird der Meta-Pixel nicht geladen.</p>
            <p className="mt-2">Ebenfalls nur mit Ihrer Einwilligung setzen wir Microsoft Advertising UET (Universal Event Tracking, Microsoft Ireland Operations Limited) ein, um bezahlte Buchungen unseren Anzeigen bei Microsoft Advertising (Bing) zuzuordnen. Übermittelt werden ausschließlich das Ereignis, der Buchungswert ohne Kaution, die Währung sowie eine pseudonyme Buchungs-/Zahlungskennung. Namen, E-Mail-Adressen, Telefonnummern, Ausweis- oder Führerscheindaten und Fahrzeugfotos werden nicht übermittelt. Eine Sitzungsaufzeichnung (Microsoft Clarity) findet nicht statt. Die Speicherung von Werbe-Kennungen ist standardmäßig auf „denied“ gesetzt und wird erst nach Ihrer Einwilligung freigegeben; bei Widerruf wird sie wieder auf „denied“ gesetzt. Ohne Einwilligung wird das Microsoft-Skript nicht geladen.</p>
            <p className="mt-2">Sie können Ihre Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen oder ändern:</p>
            <button
              type="button"
              onClick={openConsentSettings}
              className="mt-3 inline-flex items-center rounded-full border border-input bg-background px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Cookie-Einstellungen ändern
            </button>
            <p className="mt-2">Diese Hinweise beschreiben die tatsächliche technische Umsetzung und stellen keine Rechtsberatung dar.</p>
          </div>

          <div>
            <h2 className="font-bold text-lg text-foreground mb-2">8. Partnerlinks (Awin)</h2>
            <p>Auf einigen Seiten zeigen wir als „Anzeige · Partnerlink“ gekennzeichnete Links zu ausgewählten Händlern, die über das Partnernetzwerk Awin (AWIN AG) vermittelt werden. Beim Seitenaufruf werden dafür keine Skripte, Pixel oder Bilder von Awin oder den Händlern geladen. Erst wenn Sie einen Partnerlink bewusst anklicken, werden Sie über einen Server von Awin zum Händler weitergeleitet; dabei verarbeiten Awin und der Händler nach ihren eigenen Datenschutzhinweisen Daten wie IP-Adresse und Klickzeitpunkt und können Cookies setzen, um einen Kauf zuzuordnen. Bei einem Kauf über diese Links können wir eine Provision erhalten.</p>
          </div>

          <p className="text-xs text-muted-foreground mt-8">Stand: 29. September 2026</p>
        </div>
      </div>
    </main>
  );
}