Ich richte alles automatisch ein, damit du sofort per E-Mail und Handy-Push benachrichtigt wirst, wenn jemand bucht.

## Was passiert

1. **VAPID-Schlüssel selbst generieren** – Ich erzeuge die nötigen Push-Schlüssel automatisch (kein manuelles Eingeben nötig). Der öffentliche Schlüssel kommt in den Code, der private wird als verschlüsseltes Secret `VAPID_PRIVATE_KEY` hinterlegt.
2. **Admin-Mail fix** – `kroega.christian96@gmx.de` wird fest im Code als Empfänger der Buchungs-Benachrichtigungen verankert (kein Secret nötig).
3. **Push-System aktiv schalten** – Die bereits vorbereitete Infrastruktur (Service Worker, Datenbank-Tabelle, Button im Admin-Bereich) wird scharfgeschaltet.

## Was du danach machen musst (einmalig, 1 Minute)

1. Auf deinem Handy `mytransporter.org` im Browser öffnen, eingeloggt als Christian.
2. Seite zum Home-Bildschirm hinzufügen (Safari: Teilen → "Zum Home-Bildschirm"; Chrome: Menü → "App installieren").
3. Die installierte App öffnen, in den Admin-Bereich gehen und einmal auf **"Push aktivieren"** tippen → Benachrichtigungen erlauben.

Danach: Bei jeder neuen Buchung sofort Push aufs Handy + Mail an dein Postfach.

## Technische Details

- `node` Script generiert VAPID-Keypair, public key landet in `src/lib/push-config.ts`, private key per `secrets--add_secret` (Wert wird automatisch eingetragen — du musst nichts kopieren).
- Admin-Empfängermail hartkodiert in `src/lib/booking-emails.functions.ts` mit Fallback auf `kroega.christian96@gmx.de`.
- Keine weiteren Code-Änderungen nötig — Implementierung aus dem letzten Schritt bleibt bestehen.
