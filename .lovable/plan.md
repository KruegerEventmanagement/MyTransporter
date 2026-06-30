## Ziel
Push-Benachrichtigungen müssen zuverlässig und sofort kommen bei:
1. **Neuer Buchung** (läuft schon teilweise, aber nicht „aggressiv" genug)
2. **Neuer Registrierung** (fehlt komplett als Push – aktuell nur DB-Eintrag in `admin_notifications`)

## Was geändert wird

### 1. Push bei neuer Registrierung
Aktuell legt der DB-Trigger `handle_new_user` nur eine Zeile in `admin_notifications` an. Kein Push.
- **Migration**: neuen DB-Trigger ergänzen, der per `pg_net` (HTTP) eine interne Public-Route aufruft, sobald in `admin_notifications` ein Eintrag mit `type = 'user_registered'` oder `type = 'booking_created'` landet. Ruft `/api/public/hooks/notify-admin` mit Service-Role-Token auf.
- **Neue Route** `src/routes/api/public/hooks/notify-admin.ts`: validiert Token, ruft `pushToAdmins(...)` mit passendem Titel/Body/URL.
- Damit ist Push komplett serverseitig garantiert – auch wenn der Browser des Kunden zwischendurch abstürzt.

### 2. Push „aggressiver"
In `src/lib/push.functions.ts` (`pushToAdmins`) und `public/sw.js`:
- `urgency: 'high'` und `TTL: 3600` an `webpush.sendNotification` (sofortige Zustellung statt Sammeln).
- **Eindeutige `tag`** pro Event (statt fester Tag → vorherige Push wird sonst überschrieben). Bei Buchung: `booking-<id>`, bei Registrierung: `signup-<userId>`.
- Längeres Vibrationsmuster `[400, 150, 400, 150, 400]`.
- `requireInteraction: true` bleibt – Benachrichtigung bleibt sichtbar bis weggeklickt.
- Doppelte Zustellung: bei `booking_created` zusätzlich ein zweiter Push nach ~10 s mit anderem Tag, falls der erste nicht angeklickt wurde (DB-Notiz „nicht gelesen" reicht für Erkennung – sonst einfach zweimal senden mit Delay).
- Im SW: `silent: false`, klarer Titel `🚨 Neue Buchung` / `👤 Neue Registrierung`.

### 3. Bestehende Aufrufe konsolidieren
- Doppelte Aufrufstellen (`checkout.return.tsx` clientseitig + Mail-Funktion serverseitig) bleiben als Fallback, aber Tag wird vereinheitlicht damit nicht mehrere Pushs gegenseitig überschrieben werden.

## Geänderte / neue Dateien
- `supabase/migrations/<neu>.sql` – Trigger auf `admin_notifications` + pg_net call
- `src/routes/api/public/hooks/notify-admin.ts` – neue Public-Route
- `src/lib/push.functions.ts` – urgency, TTL, eindeutiger Tag, Titel-Emojis, Re-Send bei Buchung
- `public/sw.js` – kleinere Anpassung (Titel/Tag aus Payload, längere Vibration)

## Nicht enthalten
- Kein Sound-Loop (iOS erlaubt das nicht aus dem SW; Sound im Admin-Dashboard läuft bereits separat).
- Keine SMS-Benachrichtigung (separates Thema, kostenpflichtig).
