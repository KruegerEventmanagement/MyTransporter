# Foto-Link aus der Kundenmail reparieren

## Was bereits feststeht
- Die Mails verlinken auf `https://mytransporter.org/trip/<Buchung>`. Diese Seite ist live erreichbar.
- Die Android-Freigabe für App-Links (`/.well-known/assetlinks.json`) nennt die falsche App-Kennung `de.mytransporter.app`. Die App im Play Store heißt `de.mytransporterr.app`. Darum öffnet Android den Link nie in der App.
- Für iPhone gibt es keine Freigabe-Datei (`apple-app-site-association`). Links öffnen dort also immer im Browser.
- Ohne Anmeldung leitet die Fahrtseite auf die Startseite um. Das Ziel wird nur in `sessionStorage` gespeichert. Wird der Link in einem neuen Tab oder im Mail-eigenen Browser geöffnet, geht das Ziel leicht verloren, und der Kunde landet auf der Startseite statt bei seinen Fotos.

## Schritte
1. **Fehler nachstellen:** Den Mail-Link mit Playwright öffnen, angemeldet und abgemeldet, wie ein Android- und ein iPhone-Browser. Dabei die genaue Fehlermeldung festhalten. Der gemeldete Fehler wird erst behoben, wenn er nachgestellt ist.
2. **Android-App öffnet den Link:** In `assetlinks.json` die echte Kennung `de.mytransporterr.app` eintragen und den SHA-256-Fingerabdruck des Play-Signaturschlüssels verwenden. Die alte Kennung bleibt zusätzlich drin.
3. **iPhone-App:** Eine `apple-app-site-association` für `/trip/*` und `/buchung/*` anlegen, sobald Team-ID und Bundle-ID bekannt sind. Danach die Associated Domains in der iOS-App eintragen.
4. **Ohne Anmeldung zurück zur Fahrt:** Das Ziel zusätzlich in der Adresse mitgeben, also `/?login=1&redirect=/trip/<id>`, und nach dem Login dorthin springen. Erlaubt sind dabei nur interne Pfade.
5. **Fotobereich sofort sichtbar:** Nach dem Laden über den Link scrollt die Seite direkt zum Bereich „Foto aufnehmen / Aus Galerie wählen“.
6. **Tests:** Rücksprung nach dem Login, Schutz vor externen Zielen, und eine Prüfung, dass `assetlinks.json` die Play-Kennung enthält.

## Was du danach noch tun musst
- Veröffentlichen.
- Ob Android die Links in der App öffnet, prüft Android erst nach einer Neuinstallation oder einem App-Update. Dafür ist kein neuer App-Build nötig. Für das iPhone braucht es einen neuen App-Build.

## Technisch
- Dateien: `public/.well-known/assetlinks.json`, `public/.well-known/apple-app-site-association` (neu, ohne Dateiendung, `application/json`), `src/lib/login-redirect.ts`, `src/components/Navbar.tsx` (Login-Abschluss), `src/routes/trip.$bookingId.tsx`, `src/routes/buchung.$bookingId.tsx`, Tests in `src/test`.
- Mailinhalte, Buchungen, Fotos und Preise bleiben unverändert.
