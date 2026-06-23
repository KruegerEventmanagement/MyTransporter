## Was tatsächlich passiert ist

Ich habe die Server-Logs der letzten Buchung geprüft. Die Buchungs- und Admin-Mails **werden** ausgelöst – Resend lehnt sie aber ab:

```
[error] Resend send failed {"statusCode":422,"message":"The email address length is more than 320 characters long."}
```

Das ist ein klassischer 422: irgendein Feld in `from` / `to` ist zu lang. Im Code stehen kurze Werte (`info@mytransporter.org`), also kommt der zu lange Wert aus dem Secret `RESEND_FROM_EMAIL`. Vermutlich ist da bei einer Konfiguration aus Versehen ein riesiger String (z. B. ein ganzer JWT oder mehrfach kopierte Adresse) gelandet. Solange dieses Secret kaputt ist, geht **keine** Mail raus – weder Buchungsbestätigung, noch Admin-Mail, noch Registrierungs-Mail.

## Fix 1 – E-Mail (`src/lib/booking-emails.functions.ts`)

`FROM` wird härter validiert, sodass kaputte Secrets nicht mehr alles blockieren:

- Wenn `RESEND_FROM_EMAIL` fehlt **oder** > 200 Zeichen ist **oder** kein `@` enthält → automatischer Fallback auf `MyTransporter <info@mytransporter.org>`.
- Bei Resend-Fehler wird ab jetzt zusätzlich der HTTP-Status + Body in `admin_notifications` geschrieben, damit man im Admin sofort sieht, wenn eine Mail nicht raus ging (statt nur Worker-Log).
- Gleicher Schutz für `ADMIN_NOTIFY_EMAIL`.

Damit gehen Buchungs- und Registrierungsmails an `info@mytransporter.org` zuverlässig raus.

Zusätzlich räume ich das kaputte Secret `RESEND_FROM_EMAIL` weg (Delete) – der Code-Fallback übernimmt dann automatisch.

## Fix 2 – iPad spielt keinen Ton

Technisch ist auf Server- und SW-Seite alles korrekt verdrahtet (`requireInteraction`, `vibrate`, Standard-Notification-Sound). Auf iPadOS gilt aber:

- Web-Push funktioniert **nur**, wenn die Seite **als App auf den Home-Bildschirm installiert** ist (Safari → Teilen → „Zum Home-Bildschirm").
- Der Ton kommt vom System, nicht von der App. Wenn auf dem iPad „Nicht stören", „Stummschalter" oder „Mitteilungston für MyTransporter = Aus" aktiv ist, kommt kein Geräusch – selbst wenn die Benachrichtigung erscheint.
- Custom-Sounds sind in Web Push auf iOS **nicht** unterstützt; das ist eine Apple-Einschränkung, kein App-Bug.

Ich ergänze deshalb im Service Worker `silent: false` explizit (Defensiv-Setting) und füge im Admin unter „Push aktivieren" einen kurzen Hinweistext für iPad/iPhone hinzu („App muss auf Home-Bildschirm installiert sein, sonst kein Ton"), damit der Grund sofort sichtbar ist.

## Nicht im Plan

- Kein neues E-Mail-System, kein Provider-Wechsel.
- Keine Änderung an Buchungs-Logik, Stripe, DB-Schema.
- Keine UI-Änderung außer dem iPad-Hinweis im Push-Bereich.
