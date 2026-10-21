# Erinnerungsmails wirklich zustellen + Rückgabefotos durchsetzen

## Befund (geprüft)
- Die abgebrochenen Mails (24h, 30min/Schlüsselcode, Rückgabe) liefen alle schon über Gmail, scheiterten aber jedes Mal mit „Gmail-Anfrage nicht sicher abgeschlossen“. Die 24h-Mail wurde 78-mal versucht und dann verworfen.
- Diese Meldung entsteht, bevor Gmail überhaupt etwas annimmt (Kontoprüfung oder Versandsperre bricht ab). Der genaue Auslöser ist noch nicht bestätigt – das ist Schritt 1.
- Rechnungen und die Bewertungsmail gingen über Gmail erfolgreich raus, der Gmail-Zugang selbst funktioniert also grundsätzlich.

## Teil 1 – Mails zuverlässig senden
1. Ursache eingrenzen: echten Fehler (ohne Mailinhalt/Geheimnisse) protokollieren und mit dem funktionierenden Rechnungsweg vergleichen. Vermutung: Erinnerungen laufen in einem anderen Hintergrundjob, dem dort ein Wert fehlt oder der zu kurze Zeit bekommt.
2. Ursache beheben, statt nur Fehlermeldungen zu unterdrücken.
3. Wiederholung entschärfen: echte Fehler nach wenigen Versuchen klar als „fehlgeschlagen“ melden (eine Admin-Meldung pro Mail, nicht 78).
4. Keine Nachsendung abgelaufener alter Erinnerungen (würden zu spät ankommen und verwirren).

## Teil 2 – Kunden zu den Rückgabefotos drängen
Pauschale bleibt wie vereinbart: 30 € Abzug von der Kaution bei fehlenden Fotos, nur nach deiner Prüfung, nie bei technischen Fehlern.

Neue Erinnerungskette (je Buchung genau einmal pro Stufe, endet sofort, sobald alle Fotos da sind):
- 30 Min vor Mietende: E-Mail (bestehend) + Push, mit klarer Zeile „Ohne Fotos: 30 € Abzug von deiner Kaution“.
- Bei Mietende: Push „Fahrzeug abgestellt? Jetzt 7 Fotos machen“.
- 30 Min nach Mietende, falls Rückgabe nicht abgeschlossen: E-Mail „Rückgabe noch offen – 30 € Kautionsabzug droht“ + Push.
- 3 Std nach Mietende: letzte E-Mail + Push „Letzte Erinnerung“.
- Auf Website/App: deutlich sichtbarer schwarzer Balken auf jeder Seite, solange eine beendete Fahrt ohne Fotos offen ist, mit Knopf direkt in den Foto-Ablauf (Pop-up bleibt zusätzlich).
- In der Buchungsbestätigung und beim Fahrtstart: Satz „Ohne vollständige Rückgabefotos ziehen wir 30 € von der Kaution ab“ fett hervorheben.

Nicht betroffen: alte verfallene Buchungen, stornierte, bereits zurückgegebene Fahrten.

## Technische Details
- Fehlerpfad in `gmail-mail-provider.server.ts` (catch vor Claim) mit sicherem Fehlercode protokollieren; Reminder-Runner (`send-reminders`, `return-reminder-mail.server.ts`, `customer-mail-outbox.server.ts`) gegen Rechnungs-Runner abgleichen (Env-Zugriff im Handler, Timeout, Claim-RPC).
- Neue Outbox-Arten `return_overdue_1`, `return_overdue_2` (additive Migration für kind-Check), Fälligkeit über `resolveTripWindow`, Precheck bricht ab bei abgeschlossener Rückgabe; Pushes über bestehenden Minutenjob `return-reminders` mit Dedupe je Stufe.
- Banner-Komponente auf Basis `useActiveTrip`/`active-trip.ts`, ausgeblendet bei `isLegacyOpenTrip`.
- Tests: Stufen-Fälligkeit, Stopp nach Rückgabe, kein Doppelversand, Gebührentext; volle Suite, Typecheck, Build. Keine Test-Kundenmails, nicht veröffentlichen.
