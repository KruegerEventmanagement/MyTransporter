# Rückgabe-Erinnerungsmails: neuer Betreff und neuer Anfang

## Was sich ändert
Gilt für alle drei Rückgabe-Mails (30 Min vor Mietende, 30 Min danach, 3 Std danach).

**Betreff (alle drei gleich, letzte Mail mit Zusatz):**
- „Es drohen 30 € Bearbeitungsgebühr bei fehlenden Rückgabefotos …“
- Letzte Mail: „Letzte Erinnerung: Es drohen 30 € Bearbeitungsgebühr bei fehlenden Rückgabefotos …“

**Die Mail beginnt direkt mit:**
„Es müssen alle Fotos gemacht und hochgeladen werden:
- Tankbeleg
- Tacho mit Kilometerstand und Tankanzeige
- Innenraum / Fahrerkabine (wie sauber das Fahrzeug ist)
- Laderaum innen
- Außen: vorn, hinten, links und rechts

Werden diese Fotos nicht hochgeladen und muss ein Mitarbeiter das Fahrzeug nachträglich prüfen, stellen wir dir zusätzlich 30 € Bearbeitungsgebühr in Rechnung.“

Danach folgen wie bisher Mietende/Fahrzeug, der Knopf „Jetzt Rückgabefotos machen“ und der kleine Hinweis, dass technische Fehler (Kamera, Upload, Netz) keine Gebühr auslösen.

## Unverändert
- Wann und wie oft die Mails kommen, je Stufe genau einmal, Stopp nach Rückgabe.
- Die 30 € werden nie automatisch abgebucht, nur nach deiner Prüfung.
- Push-Texte bleiben kurz wie jetzt.

## Technische Details
- `src/lib/return-reminder-mail.server.ts`: `buildReturnReminderMail` und `buildOverdueMail` nutzen gemeinsamen Betreff/Einleitungsblock (Konstanten in `src/lib/return-notice.ts`); Fotoliste als Aufzählung im HTML und im Textteil.
- Kleiner Test: Betreff beginnt mit „Es drohen 30 € Bearbeitungsgebühr“, Mail enthält alle Pflichtfotos. Volle Suite, Typecheck. Keine echte Mail, nicht veröffentlichen.
