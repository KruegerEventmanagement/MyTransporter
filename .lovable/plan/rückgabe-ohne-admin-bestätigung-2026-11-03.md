# Rückgabe ohne Admin-Bestätigung

## Was sich ändert

**Für den Kunden**
- Nach allen Fotos, Kilometer- und Tankstand tippt der Kunde auf „Fahrzeug zurückgeben" (bisher „Buchung abschließen").
- Danach erscheint ein Bestätigungsfenster:
  „Möchten Sie das Fahrzeug jetzt zurückgeben? Danach können Sie an Ihrer Buchung nichts mehr ändern."
  Knöpfe: „Abbrechen" und „Ja, jetzt zurückgeben".
- Mit „Ja" ist die Rückgabe endgültig. Kein Warten mehr auf deine Bestätigung; der Kunde sieht direkt die Abschlussseite mit Rückgabecode.

**Für dich (Admin)**
- Der Knopf „Rückgabe bestätigen" verschwindet. Die Buchung steht sofort auf „abgeschlossen".
- Du siehst in der Buchung, wann der Kunde fertig war (Zeitpunkt der Rückgabe), plus alle Fotos, Kilometer, Tank und „Sonstiges"-Hinweise wie bisher.
- Die Kautions-Erinnerung nach 48 h, Mehrkilometer und Dokumentationspauschale laufen unverändert weiter.
- Das Fahrzeug ist nach der Rückgabe wieder für neue Buchungen frei (bisher erst nach deiner Bestätigung).

**Bestehende Fälle**
- Buchungen, die gerade auf deine Bestätigung warten, werden nicht automatisch verändert. Für diese bleibt der Knopf sichtbar, damit nichts hängen bleibt.

## Technische Details
- Neue Vorwärts-Migration patcht `report_trip_return`: setzt `status = 'completed'` statt `'returning'`, Rest (Fotoprüfung, Notizen, Mehr-km, idempotenter return_code, `return_reported_at`) bleibt. Wiederholter Aufruf auf bereits `completed` (mit vorhandenem return_code) liefert denselben Code zurück statt Fehler.
- `ReturnFlow.tsx`: Bestätigungsdialog vor `submitReport`; `awaitingAdmin`-Warten entfällt, nach Erfolg direkt Abschluss/`onComplete`.
- `admin.tsx`: Button nur noch für Altfälle mit Status `returning`; Anzeige „Zurückgegeben am …" aus `return_reported_at`.
- Prüfen, dass Kautions-Sweep, Feedback-Mail-Outbox und Rückgabe-Erinnerungen `completed` + `return_reported_at` korrekt behandeln (keine Doppel-Erinnerung, keine Mail vor Rückgabe).
- Tests: SQL-Test „Rückgabe setzt completed, Retry idempotent, Fotopflicht bleibt"; UI-Text-neutraler Test, dass ohne Bestätigung nicht gesendet wird. Neue Texte in alle sieben Sprachen.
- AGENTS.md-Regel zur Rückgabe aktualisieren.
