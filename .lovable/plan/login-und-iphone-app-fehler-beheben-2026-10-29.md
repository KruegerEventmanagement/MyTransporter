# Login- und iPhone-App-Fehler beheben

## Was ich bereits geprüft habe
- Das Konto samira.aay@proton.me existiert, wurde heute 08:46 Uhr erstellt und ist bestätigt. Um 09:17 Uhr hat sie sich **erfolgreich angemeldet** – das Konto selbst ist also in Ordnung.
- Die Fehlermeldung im Screenshot ist englisch („Invalid login credentials“) und hilft Kunden nicht weiter.
- Das Login-Formular übernimmt die E-Mail ungefiltert (Leerzeichen am Ende, Großbuchstaben durch iPhone-Autokorrektur werden mitgeschickt).
- Wahrscheinlicher Ablauf: Beim Registrieren hat das iPhone ein „starkes Passwort“ vorgeschlagen bzw. gespeichert, das nicht zum tatsächlich gespeicherten passte, oder Autofill/Autokorrektur hat die Eingabe verändert. Ganz sicher belegen lässt sich das nicht.
- iPhone-App: Die Seite ist als Home-Bildschirm-App vorbereitet. Auf dem iPhone gibt es aber technisch **keinen automatischen Installieren-Knopf** – Apple erlaubt nur „Teilen → Zum Home-Bildschirm“. Der Knopf oben links zeigt dafür eine Anleitung, die offenbar nicht verständlich genug ist bzw. in Apps wie WhatsApp/Instagram nicht funktioniert.

## Änderungen
1. **Login robuster**
   - E-Mail vor dem Anmelden/Registrieren automatisch bereinigen (Leerzeichen weg, klein geschrieben) – in Buchung, Profil und Passwort-vergessen.
   - Felder für iPhone richtig kennzeichnen (keine Autokorrektur/Großschreibung, Passwort-Manager erkennt Login vs. Registrierung korrekt).
   - Verständliche deutsche Fehlermeldungen, z. B. „E-Mail oder Passwort stimmt nicht. Passwort vergessen?“ mit direktem Link zum Zurücksetzen; ebenso für Zeitüberschreitung und „Konto existiert bereits“.
2. **iPhone-App-Download verständlich**
   - Knopf oben links öffnet auf dem iPhone eine klare Bild-für-Bild-Anleitung (Teilen-Symbol → „Zum Home-Bildschirm“ → „Hinzufügen“).
   - Wird die Seite in WhatsApp, Instagram, Facebook o. ä. geöffnet, erklärt der Hinweis zuerst „In Safari öffnen“ mit Link-Kopier-Knopf, weil dort keine Installation möglich ist.
   - Prüfen, dass App-Symbol und Name auf dem Home-Bildschirm korrekt erscheinen.
3. **Prüfen**: Login/Registrierung in einer iPhone-Simulation durchklicken (mit Testkonto, keine Kundendaten), Tests für die E-Mail-Bereinigung und Fehlermeldungen ergänzen.

## Nicht enthalten
- Die Übersicht der Zeiträume kommt danach, wie gewünscht.
- Keine Änderung an Buchungen, Zahlungen, Mails oder an Samiras Konto.
- „Kontinuierlich kümmern“: Ich kann nur arbeiten, wenn du mir schreibst; zwischen den Nachrichten läuft nichts automatisch. Ich prüfe aber bei jeder Nachricht zuerst die Fehlerprotokolle.

## Technische Details
- `BookingSection.tsx` (handleLogin/handleRegister), Profil-Login, `password-reset.ts`: `email.trim().toLowerCase()`; `autoComplete="email|current-password|new-password"`, `autoCapitalize="none"`, `autoCorrect="off"`, `inputMode="email"`.
- Fehler-Mapping-Funktion `authErrorMessage()` mit Test.
- `InstallBanner.tsx`: In-App-Browser-Erkennung (FBAN/FBAV/Instagram/WhatsApp/Line), Kopieren-Button, verbesserte iOS-Anleitung.
