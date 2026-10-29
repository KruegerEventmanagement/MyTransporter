# Schlüsselcode per SMS (seven.io)

## Was der Kunde bekommt
15 Minuten vor Abholung kommt **zusätzlich zur Code-Mail** eine SMS. Absender: **MyTransport** (seven.io erlaubt höchstens 11 Zeichen, „MyTransporter“ hat 13).

Textvorschlag (ca. 3 SMS-Teile, etwa 25–30 Cent pro Kunde):

```text
MyTransporter: Dein Schlüsselcode für den Transporter PF MY 1003.
Dein Schlüssel liegt in Box 2 am OBI Leonberg (Eingang, Fahrradständer). Code: 1234
Der Transporter steht an der Poststraße 63 an der Straße – bitte nirgends klingeln.

Bitte mach vor und nach der Fahrt Fotos in der App bzw. auf mytransporter.org: außen, innen, Tachostand und nach der Fahrt den Tankbeleg. Fehlen sie, müssen wir alles selbst prüfen lassen – dann werden mindestens 30 € von der Kaution abgezogen.
Bitte nicht rauchen und Schäden sofort melden. Verschwiegene Schäden verursachen zusätzliche Kosten.
Gute Fahrt!
```

Hinweis: Die Sätze zu „mindestens 30 €“ und „zusätzliche Kosten bei verschwiegenen Schäden“ sind sachlich formuliert und passen zu den bestehenden AGB/Hinweisen. Drohungen darüber hinaus nehme ich nicht auf.

## Sicherheit
- Pro Buchung höchstens **eine** SMS, auch wenn die Prüfung minütlich läuft (gleicher Doppelversandschutz wie bei der Code-Mail).
- Bei seven.io-Fehlern höchstens wenige Wiederholungen im selben Zeitfenster, danach Eintrag im Admin-Protokoll.
- Ohne gültige Handynummer gibt es keine SMS, nur die Mail. Das Protokoll zeigt „keine Nummer“.
- SMS gehen nur an deutsche und EU-Nummern, um teuren Missbrauch zu verhindern.
- Code steht nur in der SMS, nie in Protokollen.
- Altbuchungen bekommen keine SMS. Die SMS startet erst, wenn du sie einschaltest.

## Was ich von dir brauche
1. Ein Konto bei **seven.io** (Registrierung, etwas Guthaben aufladen, z. B. 10 €).
2. Dort unter **Entwickler → API-Schlüssel** einen Schlüssel erstellen. Ich frage ihn danach über ein sicheres Eingabefeld ab, nicht im Chat.
3. Deine Handynummer für **eine** Test-SMS, damit du den Text vorher selbst siehst.

## Technische Details
- Neues Modul `src/lib/sms.server.ts` (seven.io `POST https://gateway.seven.io/api/sms`, Header `X-Api-Key`, Secret `SEVEN_API_KEY`) und reiner Textbaukasten `src/lib/key-sms.ts` mit Tests (Tresor-/Kennzeichenzuordnung, Länge, kein Code ohne Tresor).
- Neue Tabelle `key_code_sms` (booking_id/manual_id eindeutig, Status, Versuche, Provider-ID, Fehler), RLS nur für Admins; atomarer Claim per RPC.
- Telefonnummer aus `profiles.phone` bzw. `customer_phone` bei manuellen Buchungen, normalisiert auf E.164 (+49…).
- Aufruf im bestehenden Minutenjob `send-reminders` direkt nach der Code-Mail, unabhängig davon (ein SMS-Fehler stoppt die Mail nicht und umgekehrt).
- Schalter `KEY_SMS_ENABLED` plus Startzeitpunkt, damit nur neue Abholungen eine SMS bekommen.
- Admin-Protokoll zeigt den SMS-Status neben der Code-Mail.
