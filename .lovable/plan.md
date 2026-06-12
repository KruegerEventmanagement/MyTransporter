Christian (Admin-Account `kroega.christian96@gmx.de`) bekommt ab sofort bei jeder neuen Buchung **zwei** Benachrichtigungen:

1. **E-Mail** an seine Admin-Adresse – sofort, mit allen Buchungsdetails.
2. **Push-Benachrichtigung** auf das Handy – über die bereits installierte MyTransporter-PWA (Web-Push). Funktioniert auf Android und auf iOS ab Version 16.4, sobald die App einmal zum Home-Screen hinzugefügt und Push erlaubt wurde.

---

## 1. Admin-E-Mail bei Buchung

- Neue Server-Funktion `sendAdminBookingNotification` (in `src/lib/booking-emails.functions.ts`), die parallel zur bestehenden Kundenbestätigung läuft.
- Empfänger: Admin-E-Mail aus Umgebungsvariable (`ADMIN_NOTIFY_EMAIL`, Default `kroega.christian96@gmx.de`).
- Inhalt: Kunde (Name/E-Mail/Tel), Fahrzeug, Tarif, Start-/Rückgabezeit, Zubehör, Abholcode, direkter Link `/admin`.
- Aufruf in `src/routes/checkout.return.tsx` direkt nach `sendBookingConfirmation` (im Hintergrund, blockiert nichts).
- Versand-Provider: bestehender Resend-Account (`RESEND_API_KEY` ist schon konfiguriert).

## 2. Push-Benachrichtigungen aufs Handy (Web Push / PWA)

### Einrichtung (einmalig)

- VAPID-Schlüsselpaar generieren und als Secrets `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (mailto) ablegen.
- Neue Tabelle `push_subscriptions` (user_id, endpoint, p256dh, auth, user_agent, created_at) mit RLS: User darf nur eigene Subscriptions schreiben/lesen, Service-Role pusht.
- Service-Worker `public/sw.js` um `push`- und `notificationclick`-Listener erweitern (öffnet `/admin`).
- Manifest/Worker-Registration ist bereits vorhanden (PWA läuft), nur Push-Handling kommt dazu.

### UI im Admin-Bereich

- In `src/routes/admin.tsx` neuer Button **„Push aktivieren“**:
  - Fragt Browser-Permission ab.
  - Ruft `serviceWorker.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: VAPID_PUBLIC })` auf.
  - Speichert Subscription in `push_subscriptions`.
- Status-Anzeige („aktiv auf diesem Gerät / nicht aktiv“) und Test-Push-Button.

### Auslösung beim Buchungs-Ereignis

- Neue Server-Funktion `sendAdminPush({ title, body, url })`:
  - Holt alle Subscriptions von Usern mit Rolle `admin` (`has_role`).
  - Sendet Web-Push via `web-push`-Library mit VAPID-Auth.
  - Bei `410 Gone` Subscription automatisch löschen.
- Aufruf parallel zur Admin-Mail in `checkout.return.tsx`.

## Wichtige Hinweise für dich

- **iPhone**: Push funktioniert nur, wenn du die Seite **einmal über „Zum Home-Bildschirm“ hinzufügst** und dann in der so installierten App Push erlaubst. Safari-Tab allein bekommt keine Push-Nachrichten.
- **Erste Aktivierung**: Du musst dich nach dem Deployment einmal auf dem Handy einloggen, in den Admin-Bereich gehen und „Push aktivieren“ tippen. Danach kommen die Pushs automatisch.
- **Backup**: Selbst wenn Push mal scheitert (Browser zu, Permission entzogen), bekommst du die E-Mail in jedem Fall.

## Technische Details

- Bibliothek: `web-push` (Node-kompatibel, läuft im Worker-SSR-Runtime).
- Migration: `push_subscriptions`-Tabelle + GRANTs + RLS-Policies.
- Keine Änderung am bestehenden Customer-Email- oder Stripe-Flow.
- Reihenfolge im Checkout-Return (unverändert blockierend): Buchung anlegen → danach im Hintergrund Kunden-Mail, Admin-Mail, Admin-Push.
