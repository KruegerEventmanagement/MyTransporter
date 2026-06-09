## Zwei Aufgaben

### 1. Bug-Fix: `/trip/{id}` ignoriert `booking.status`

**Problem:** `src/routes/trip.$bookingId.tsx` initialisiert `phase` immer auf `"pre"`. Eine Buchung mit Status `active` oder `returning` zeigt fälschlicherweise wieder Abhol-Code / Pre-Drive.

**Fix:** Phase aus `booking.status` ableiten (in einem `useEffect` nach dem Laden):
- `active` → `phase = "active"`
- `returning` → `phase = "return"`
- `completed` / `cancelled` → `phase = "done"`
- sonst → `"pre"` (default)

Eine Datei, ~10 Zeilen.

### 2. Stripe von Sandbox → Live umschalten

**Status laut Go-Live-Check:** Alle 5 Schritte abgeschlossen, Live-Keys provisioniert.

**Aktuelles Problem:** `src/lib/stripe.ts` hat den Sandbox-Publishable-Key (`pk_test_...`) hardcoded und fällt darauf zurück, weil `VITE_PAYMENTS_CLIENT_TOKEN` nicht gesetzt ist. Der Server-Side-Stripe-Client wählt das Environment basierend auf dem an `createBookingCheckout` übergebenen `environment`-Parameter — der wiederum aus dem Client kommt (`getStripeEnvironment()` schaut auf das Prefix des Client-Tokens). Solange der Client-Token `pk_test_` bleibt, läuft alles im Sandbox-Modus.

**Was ich brauche von dir:** den Live-Publishable-Key deines Stripe-Accounts (beginnt mit `pk_live_...`). Diesen findest du in deinem Stripe-Dashboard unter:
**Developers → API keys → Standard keys → Publishable key** (im Live-Modus, nicht Sandbox).

**Was ich dann mache:**
1. Den `pk_live_...` als Fallback in `src/lib/stripe.ts` setzen (oder besser: als `VITE_PAYMENTS_CLIENT_TOKEN` in `.env` schreiben, damit Sandbox/Live einfach umschaltbar bleibt für spätere Tests).
2. Verifizieren, dass `getStripeEnvironment()` `'live'` zurückgibt → Server nutzt `STRIPE_LIVE_API_KEY` und `PAYMENTS_LIVE_WEBHOOK_SECRET`.
3. Webhook-URL in Stripe Live-Modus prüfen — Lovable hat sie automatisch beim Provisioning angelegt, aber wir verifizieren, dass `/api/public/...` Webhook-Endpoint die `?env=live` Query bekommt.
4. Projekt publishen (Frontend-Änderungen brauchen das Publish-Klick).

**Wichtig:** Sobald live, werden echte Karten belastet. Empfehlung: erste echte Test-Buchung mit deiner eigenen Karte und kleinem Betrag, dann Geld zurückerstatten.

### Reihenfolge in der nächsten Runde (Build-Mode)
1. Trip-Bug fixen (kann ich sofort)
2. Auf deinen `pk_live_...` warten
3. Stripe-Client umstellen
4. Publishen

**Bitte poste deinen Live-Publishable-Key** (`pk_live_...`) — der ist öffentlich/safe und darf im Frontend stehen.