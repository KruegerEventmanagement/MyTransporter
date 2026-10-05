# Kilometerstand speichern und Startseiten-Logo vereinheitlichen

## Ziel
- Der eingegebene End-Kilometerstand lässt sich während einer aktiven Fahrt wieder zuverlässig speichern.
- Auf jeder sichtbaren Seite steht oben links das kleine offizielle MyTransporter-Logo als Link zur Startseite.
- Buchungs-, Preis-, Zahlungs-, Mail-, Push- und Kalenderlogik bleiben unverändert.

## Bestätigte Ursache des Speicherfehlers
Die Rückgabeansicht schreibt aktuell den Kilometer- und Tankstand als erlaubten Entwurf in die eigene Buchung. Die aktive Datenbankrichtlinie prüft dabei die Schutzfunktion `bookings_locked_fields_unchanged`, aber deren Ausführungsrecht wurde der angemeldeten Rolle später entzogen. Dadurch scheitert auch ein erlaubtes Kunden-Update, bevor der bereits vorhandene Feldschutz greifen kann. Der sichtbare allgemeine Hinweis „Speichern fehlgeschlagen“ passt genau zu diesem Pfad.

Der fiktive Admin-Testmodus ersetzt nur die Pflichtfotos durch TEST-Platzhalter; beim Kilometerstand läuft er weiterhin über denselben echten, geschützten Speicherweg. Deshalb kann der Fehler auch im Testmodus auftreten.

## Umsetzung

### 1. Sicheren Kilometer-Speicherweg reparieren
- Eine additive Datenbankmigration anlegen und über den normalen autorisierten Migrationsprozess anwenden.
- Die bestehende Buchungsrichtlinie so korrigieren, dass Eigentum und unveränderliche Zahlungs-/Buchungsfelder weiterhin geschützt bleiben, erlaubte Fahrtfelder aber gespeichert werden können.
- Die Schutzfunktion nicht als frei nutzbares Daten-Orakel öffnen. Stattdessen den vorhandenen serverseitigen Update-Trigger um alle bisher von der Richtlinie geschützten sensiblen Felder ergänzen und die Kundenrichtlinie auf die eigene Buchung begrenzen.
- `anon` erhält weiterhin keinen Buchungszugriff; Admin- und Service-Abläufe bleiben unverändert.
- Den Fehlertext im Client nur soweit verbessern, dass ein echter Verbindungsfehler von einer abgelehnten Speicherung unterscheidbar bleibt; keine internen Datenbankdetails anzeigen.

### 2. Kleines MyTransporter-Logo auf allen Seiten
- Aus dem bereits verwendeten offiziellen Logo-Link der Fahrtansicht eine kleine gemeinsame Logo-Komponente erstellen.
- Das Logo oben links in die bestehende Hauptnavigation integrieren, sodass Startseite, Preise, Langzeitmiete, Werbung und weitere Seiten mit dieser Navigation automatisch abgedeckt sind.
- Bei Profil, Buchungsdetails, Admin sowie Rechtliches/FAQ/Kontakt das Logo in den vorhandenen Kopfbereich einsetzen. Bestehende „Zurück“-Navigation, etwa von Buchungsdetails zum Profil, bleibt zusätzlich erhalten.
- Fahrt-, Lade-, Fehler-, Bestätigungs- und Zahlungsansichten ebenfalls mit demselben Startseiten-Link versehen, ohne doppelte Logos in der aktiven Fahrtansicht zu erzeugen.
- Auf kleinen Displays Safe-Area, Tippfläche und Abstände prüfen; Desktopansichten bleiben in Aufbau und Funktion erhalten.

## Prüfung
- Datenbanktests: eigene aktive Buchung darf nur die vorgesehenen Fahrtfelder ändern; fremde Buchung, Status, Preis, Zeitraum, Kaution, Stripe-Felder, Kilometerpreis, Codes und Abrechnungswerte bleiben gesperrt.
- Rückgabe-Komponententest: Kilometerstand-Fehler bleibt im Schritt, erfolgreicher Versuch führt weiter; serverseitige Mehrkilometerberechnung bleibt unverändert.
- Logo-Tests: Linkziel `/`, keine Doppelanzeige und keine Überlagerung in 320/360/390 px sowie Desktop.
- Relevante Tests, vollständige Testsuite, Typecheck und Produktionsbuild ausführen.
- Ausschließlich sichere Testdaten/Mocks verwenden: keine echte Buchung, Zahlung, Mail, Push-Nachricht oder Rückgabemeldung auslösen.

## Veröffentlichung
Die Korrektur wird vorbereitet und geprüft, aber nicht veröffentlicht, solange keine ausdrückliche Freigabe zum Veröffentlichen vorliegt.
