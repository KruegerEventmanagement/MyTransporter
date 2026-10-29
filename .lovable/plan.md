# Login-Problem von Samira beheben

## Was die Prüfung ergeben hat
- **Konto ist in Ordnung:** samira.aay@proton.me wurde heute um 08:46 Uhr angelegt und ist sofort bestätigt. Um 09:17 Uhr hat sie „Passwort vergessen?“ benutzt und sich über den Link angemeldet.
- **Deine Registrierungs-Mail kam an:** Um 08:46 Uhr wurde „Neue Registrierung“ per Gmail an info@mytransporter.org verschickt und angenommen. Danach folgte um 08:49 Uhr noch eine Mail. Um 08:59 Uhr kam eine zweite Registrierung von mukadderartan@hotmail.de. Auf dem Screenshot sind seine Ausweise zu sehen, vermutlich hilft er ihr.
- **Eigentliche Ursache (Screenshot mit sichtbarem Passwort):** Das gelbe Passwortfeld mit „jofqov-pypTo3-fangyx“ ist ein **vom iPhone selbst vorgeschlagenes neues Passwort**, nicht ihr echtes. Unser Login-Feld im Buchungsschritt 5 sagt dem iPhone nicht, dass es ein Anmeldefeld ist. Deshalb schlägt Safari dort ein neues „starkes Passwort“ vor. Das wird abgelehnt, 9 Fehlversuche zwischen 09:27 und 09:32 Uhr.
- Auch das Registrierungsfeld ist nicht richtig gekennzeichnet. Dadurch speichert das iPhone das echte Passwort oft nicht sauber.
- Die englische Meldung „Invalid login credentials“ heißt: Die deutsche Fehlermeldung von gestern ist noch nicht veröffentlicht.

## Was ich ändere (nur Login/Registrierung im Buchungsablauf)
1. **Anmeldefeld richtig kennzeichnen.** E-Mail als Benutzername und Passwort als „aktuelles Passwort“. Dann bietet das iPhone das gespeicherte Passwort an und kein neues mehr.
2. **Registrierungsfelder als „neues Passwort“ kennzeichnen.** Das iPhone speichert das gewählte Passwort dann korrekt zur E-Mail.
3. **Login und Registrierung als echte Formulare.** „Fertig/Los“ auf der iPhone-Tastatur meldet dann direkt an, und der Passwortspeicher funktioniert zuverlässig.
4. **Bessere Hilfe bei falschem Passwort.** Unter der Fehlermeldung kommt ein deutlicher Knopf „Passwort jetzt zurücksetzen“ mit der eingegebenen E-Mail. Beim Hinweis „bereits registriert“ gibt es denselben Knopf.
5. **Kleiner Hinweis unter dem Passwortfeld:** „Bitte nicht das vom iPhone vorgeschlagene Passwort nehmen, wenn du schon ein eigenes hast.“
6. Gleiche Prüfung im Login-Fenster oben in der Navigation. Dort sind die Felder schon richtig gekennzeichnet, ich übernehme nur den Reset-Knopf.

Preise, Buchung, Zahlung, Mails und Kontodaten bleiben unverändert. Ich verschicke keine Mail an die Kundin.

## Für Samira sofort (ohne Veröffentlichung)
Sie tippt auf „Passwort vergessen?“, öffnet den Link in der Mail und **tippt selbst ein neues Passwort ein**. Den iPhone-Vorschlag soll sie dabei ablehnen. Danach meldet sie sich mit genau diesem Passwort an.

## Technische Details
- In `src/components/BookingSection.tsx`: Login-Inputs bekommen `name="email"`/`autoComplete="username"` und `name="password"`/`autoComplete="current-password"`. Registrierungs-Passwörter bekommen `autoComplete="new-password"`. Beide Blöcke kommen in `<form onSubmit>` mit `preventDefault`, die Buttons werden `type="submit"`.
- `authErrorMessage` wird bei Login-Fehlern schon genutzt. Neu ist ein Reset-Knopf, der `ForgotPassword` mit vorausgefüllter E-Mail öffnet, über den bestehenden Weg in `src/lib/password-reset.ts`.
- Ein kleiner Test für die Meldung „falsches Passwort“ kommt in `src/lib/auth-input.test.ts`. Danach laufen Typecheck und Build.
- Wirkt für Kunden erst nach dem Veröffentlichen.
