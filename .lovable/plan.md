# Testkonto für App-Store-Prüfung (Apple / Google)

Ein ganz normales Kundenkonto ohne Admin-Rechte, mit dem die Prüfer die App ansehen können.

## Zugangsdaten
- E-Mail: `test1@mytransporter.org`
- Passwort: `Test1-MyTransporter!` (ein reines „Test1“ ist zu kurz und wird vom Login abgelehnt)

## Was passiert
1. Konto anlegen und E-Mail direkt als bestätigt markieren, damit keine Bestätigungsmail nötig ist und die Prüfer sich sofort anmelden können.
2. Profil mit Namen „Test Eins“ füllen, Kontotyp privat.
3. Nachprüfen, dass das Konto nur die normale Kundenrolle hat und keine Admin-Rechte.
4. Einmal testweise anmelden, um zu sehen, dass Login und Profilseite funktionieren.

## Was nicht passiert
- Keine Testbuchung, keine Zahlung, keine Mails an Kunden.
- Keine Ausweis- oder Führerscheinfotos hinterlegt (die Prüfer können den Ablauf selbst ansehen).
- Nichts veröffentlicht, nichts an bestehenden Konten geändert.

## Technische Details
- Anlage über die Admin-Benutzerverwaltung des Backends mit `email_confirm: true`; der bestehende Signup-Trigger legt Profil und Rolle `user` an.
- Kontrolle per Abfrage auf `user_roles` (nur `user`) und `profiles`.
