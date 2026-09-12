# Audit-Ergebnis: Admin-Push-Benachrichtigungen schlagen fehl

Der Audit ist abgeschlossen und hat nichts verändert. Buchung, Zahlung, Rechnung und alle E-Mails funktionieren einwandfrei. Ein Punkt ist neu und echt: die **Push-Benachrichtigungen an die Admin-App** werden nicht ausgeliefert.

## Befund

Bei jeder Registrierung und jedem Buchungsschritt am 12.09.2026 (10:32:25 bis 10:34:10 UTC) bricht der Benachrichtigungs-Hook mit demselben Fehler ab: der hinterlegte Push-Schlüssel hat ein ungültiges Format (`Vapid private key must be a URL safe Base 64 (without "=")`). Der Hook antwortet dadurch mit Fehler 500. E-Mails, Rechnung und Buchung sind davon nicht betroffen — die liefen alle erfolgreich.

Der Fehler tritt weiterhin auf: bei der Erinnerung „Dein Schlüssel-Code ist jetzt freigeschaltet“ am 12.09.2026 um 15:30:02 UTC exakt derselbe Schlüsselformat-Fehler, Hook-Antwort 500 um 15:30:03 UTC.

## Vorschlag zur Behebung (nur nach Freigabe)

1. Push-Schlüsselpaar neu in korrektem URL-safe-Base64-Format erzeugen und als Secrets hinterlegen (der private Schlüssel darf nur serverseitig liegen, der öffentliche Schlüssel geht in die App).
2. Im Push-Versand den Schlüssel vor Gebrauch prüfen und bei ungültigem Format nur eine Warnung protokollieren, statt den Hook mit Fehler 500 beenden zu lassen. So bleiben Buchungsschritte und Protokolleinträge auch bei Push-Problemen unbeeinträchtigt.
3. Bestehende gespeicherte Geräte-Anmeldungen prüfen: Anmeldungen, die mit dem alten Schlüssel erstellt wurden, müssen neu registriert werden (Admin muss Benachrichtigungen einmal neu erlauben).
4. Danach Typecheck, Produktionsbuild und ein Test-Push zur Kontrolle.

## Technische Details

- Fehlerquelle: `web-push`-VAPID-Konfiguration im Push-Versand (`src/lib/push.functions.ts` / `src/lib/push-config.ts`), aufgerufen über `src/routes/api/public/hooks/notify-admin.ts`.
- Der Hook soll bei Push-Fehlern mit 200 und einem `pushError`-Feld antworten, statt 500 zu werfen.
- Keine Änderung an Buchungs-, Zahlungs- oder `booking_actions`-Logik.
