# Buchungsbestätigung mit Rechnung – sicher automatisiert

## Was aktuell passiert
Nach erfolgreicher Zahlung laufen drei Schritte automatisch und je Buchung genau einmal:
1. interne Notiz „Neue Buchung"
2. Kundenbestätigung mit Rechnung als PDF-Anhang
3. Buchungsmail an info@mytransporter.org

Der Kalender im Adminbereich liest die bezahlten Buchungen direkt aus der Datenbank – ein Termin erscheint dort also automatisch, ohne zusätzlichen Eintrag.

Der „Rechnungsfehler" war eine Absicherung: falls das Rechnungs-PDF einmal nicht erzeugt werden kann, geht die Bestätigung trotzdem raus (damit der Kunde Abholzeit und Schlüssel-Code hat) und der Fehler wird intern protokolliert. In diesem Fall fehlt aber die Rechnung – genau das soll nicht offen bleiben.

## Was geändert wird

1. **Rechnung wird nachgeliefert, nie vergessen**
   Neuer eigener Automatik-Schritt „Rechnung zugestellt". Kommt das PDF beim ersten Versuch nicht zustande, wird der Schritt als offen markiert und automatisch erneut versucht; sobald das PDF vorliegt, erhält der Kunde die Rechnung per E-Mail nach. Die Bestätigungsmail selbst geht wie bisher sofort raus.

2. **Rechnungskopf mit offiziellem Logo prüfen und sichern**
   Wir erzeugen eine echte Testrechnung aus einer bestehenden Buchung und schauen sie an, damit sichergestellt ist, dass oben das offizielle MyTransporter-Logo steht (nicht der Text-Ersatz). Falls das Logo im PDF nicht sauber erscheint, wird die Einbettung korrigiert.

3. **Bestehende Lücken schließen**
   Wir prüfen alle bereits bezahlten Buchungen darauf, ob Bestätigung, Rechnung, Adminmail und Kalendereintrag vorhanden sind, und lassen fehlende Schritte einmalig sicher nachlaufen – ohne Doppelversand und ohne neue Zahlungen.

4. **Kalender**
   Wir bestätigen mit einem Test, dass eine bezahlte Buchung sofort im Adminkalender mit Fahrzeug, Zeitraum, Kunde und Buchungscode erscheint, und dass das Fahrzeug für diesen Zeitraum gesperrt ist.

## Technische Details
- `src/lib/booking-actions.server.ts`: zusätzlicher Action-Key `customer_invoice` in der bestehenden State-Machine (Unique `(booking_id, action_key)`, claim/complete/fail bleiben unverändert).
- `src/lib/booking-emails.server.ts`: Bestätigung bleibt best-effort mit Anhang; die Rechnung wird zusätzlich über den neuen Action-Key abgesichert und bei fehlendem Anhang als separate Mail mit stabiler Idempotency-Key nachgesendet.
- `src/lib/invoice-pdf.server.ts` / `src/lib/brand-logo.server.ts`: nur bei nachgewiesenem Logo-Problem anpassen; Layout bleibt unverändert.
- `src/routes/api/public/health/automations.ts`: neuer Action-Key in die Zählung offener Schritte aufnehmen.
- Keine Änderungen an Preisen, Verfügbarkeit, Stripe-Logik oder Registrierung. Abschluss mit Typecheck, Tests und Produktionsbuild.
