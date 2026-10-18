# Fix: „Speichern fehlgeschlagen: Failed to fetch" beim manuellen Termin

## Was wir wissen
- „Failed to fetch" heißt: Die Speicheranfrage hat den Server gar nicht erreicht oder keine Antwort bekommen (kein normaler Fehler wie „Fahrzeug belegt").
- Zum selben Zeitpunkt war die Vorschau kurz neu gestartet (Protokoll zeigt einen Server-Neustart). Ob das die einzige Ursache ist, ist noch nicht bestätigt.
- Für den 20.10.2026 wurde kein Termin gespeichert.
- Zusätzlich zeigt das Formular gleichzeitig den Hinweis „LEO MY 101 ist bereits belegt" – das Speichern hätte also ohnehin abgelehnt werden müssen.

## Schritte
1. **Ursache bestätigen:** Den Ablauf in der Vorschau als Admin nachstellen (ohne echte Kundenmail: Bestätigung aus) und prüfen, ob die Speicheranfrage abbricht, zu lange läuft oder der Server abstürzt (z. B. durch die neue Gmail-/Mail-Vorbereitung beim Speichern).
2. **Server-Ursache beheben**, falls der Absturz reproduzierbar ist (z. B. fehlerhafter Import oder Zeitüberschreitung beim Bestätigungsschritt). Der Versand bleibt ausgeschaltet; Speichern darf nie am Mailversand scheitern.
3. **Belegt-Hinweis ernst nehmen:** Bei erkannter Überschneidung den Speichern-Knopf sperren, statt eine Anfrage abzuschicken.
4. **Verständliche Meldung:** Statt „Failed to fetch" anzeigen: „Keine Verbindung zum Server – bitte erneut versuchen. Der Termin wurde nicht doppelt gespeichert." Wiederholen nutzt dieselbe Anfrage-ID, damit kein Doppeltermin entsteht.
5. **Test** für die neue Meldung und die Sperre bei Überschneidung; volle Tests und Build.

## Technische Details
- Datei: `src/components/admin/CalendarAdmin.tsx` (catch-Zweig Zeile ~700, Konfliktprüfung), Serverfunktion für manuelle Termine.
- `createRequestId` bleibt bis zum Erfolg erhalten (Idempotenz).
- Keine Kundenmails, kein Publish.
