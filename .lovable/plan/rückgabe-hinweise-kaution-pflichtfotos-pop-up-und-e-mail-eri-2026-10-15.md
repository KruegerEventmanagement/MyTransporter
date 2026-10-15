# Rückgabe-Hinweise: Kaution, Pflichtfotos, Pop-up und E-Mail-Erinnerung

## Ziel
Kunden sollen von Anfang an wissen: Wer die Fahrt nach dem Abstellen mit allen Pflichtfotos (inkl. Tankbeleg) abschließt, bekommt die Kaution schneller zurück und zahlt keine Bearbeitungspauschale. Wer das nicht tut, wartet bis zu 10 Werktage und es werden 30 € berechnet. Vor dem Rückgabezeitpunkt kommen eine Pop-up-Erinnerung und eine E-Mail mit direktem Link zum Rückgabe-Ablauf.

## Was gebaut wird

1. **Ein gemeinsamer Hinweistext** (an einer Stelle gepflegt, überall gleich):
   „Bitte beende nach dem Abstellen des Fahrzeugs die Fahrt in der App und mache alle vorgegebenen Fotos inklusive Tankbeleg. Dann erhältst du deine Kaution schneller zurück und es fällt keine Bearbeitungspauschale an. Ohne vollständige Rückgabe-Fotos kann die Rückzahlung der Kaution bis zu 10 Werktage dauern und es wird eine Bearbeitungspauschale von 30 € berechnet. Je nach Bank kann die Gutschrift der Kaution 1–10 Werktage dauern.“

2. **Wo der Hinweis erscheint**
   - Direkt nach der Zahlung (Seite „Zahlung erfolgreich“ und erste Ansicht der Fahrt).
   - In der Buchungsübersicht des Kunden (ersetzt den bisherigen Satz „3–10 Werktage“ durch „1–10 Werktage“).
   - In „Gut zu wissen“ auf der Startseite/Preisseite als kurzer Punkt.
   - In der Buchungsbestätigungs-E-Mail als kurzer Absatz.

3. **Pop-up auf der Website/App**
   - Sobald die Mietzeit in den letzten 60 Minuten ist (und erneut nach Ablauf, solange die Rückgabe nicht abgeschlossen ist), öffnet sich beim Öffnen der Fahrt bzw. der Startseite ein Fenster: „Fahrzeug abgestellt? Jetzt Rückgabe abschließen“ mit Button direkt in den Rückgabe-Ablauf.
   - Schließbar, erscheint aber pro Phase höchstens einmal, damit es nicht nervt.
   - Die bestehende Push-Nachricht 10 Minuten vor Ende bleibt; ihr Text bekommt den Hinweis auf schnellere Kaution / 30 €.

4. **E-Mail-Erinnerung vor der Abgabezeit**
   - Eine E-Mail 60 Minuten vor Mietende, genau einmal pro Buchung: „Deine Rückgabe steht an – bitte Fahrt mit Fotos abschließen“, mit Button zur Rückgabe und dem Kautions-/Pauschalen-Hinweis.
   - Nur für laufende Online-Buchungen; nicht für stornierte, bereits zurückgegebene oder alte verfallene Fahrten.
   - Läuft über die bestehende sichere Kunden-Mail-Warteschlange (kein Doppelversand, Erfolg nur mit Versand-ID).

## Wichtige Grenzen
- Die 30 € werden weiterhin **nie automatisch** abgebucht – nur nach deiner Prüfung, und nie bei technischen Problemen. Der Text sagt deshalb „wird berechnet“, wie bisher abgestimmt.
- E-Mails gehen erst raus, wenn der Mail-Schlüssel gültig ist (aktuell noch abgelehnt). Pop-up und Hinweistexte funktionieren sofort.
- Keine Änderung an Preisen, Kaution, Zahlung oder Rückgabe-Fotos selbst.

## Technische Details
- Text-Konstanten in `src/lib/documentation-fee.ts` (DEPOSIT_RETURN_NOTICE); Einbindung in `checkout.return.tsx`, `trip.$bookingId.tsx`, `buchung.$bookingId.tsx`, `BookingInfoSection.tsx`, Bestätigungsmail in `booking-emails.server.ts`.
- Pop-up: neue Komponente `ReturnReminderDialog` auf Basis von `src/lib/active-trip.ts` + `trip-time.ts` (Phase „endet bald/überfällig“), Dismiss pro Buchung+Phase in localStorage, ausgeblendet bei `isLegacyOpenTrip` und während des Rückgabe-Ablaufs.
- E-Mail: neue Outbox-Art `return_reminder` in `customer_mail_outbox` (additive Migration: kind-Check erweitern), Fälligkeit = Mietende − 60 min (Europe/Berlin, über `plan_end_at`), eingefrorener Payload, Abbruch per Precheck wenn Status nicht aktiv/rückgabe offen; Link mit `APP_ORIGIN`.
- Push-Text in `return-reminder.ts` ergänzen.
- Tests: Fälligkeit (inkl. Sommer-/Winterzeit), kein Versand bei abgeschlossener/stornierter/Legacy-Fahrt, Idempotenz, Pop-up-Anzeige-Logik; volle Suite, Typecheck, Build. Nicht veröffentlichen.
