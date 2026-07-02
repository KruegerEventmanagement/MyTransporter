# Server-side booking reconciliation via Stripe webhook

## Problem
`src/routes/checkout.return.tsx` creates the booking row only on the client, reading `mt_pending_booking` from `localStorage`. If the customer closes the tab, refreshes, returns in another browser, or has storage evicted (private mode/ITP), Stripe captures the payment but no `bookings` row is written, no admin notification fires, no confirmation email/invoice is sent, and no key code exists. This is a real risk of "paid but no booking".

## Fix
Move booking creation to the server, triggered by Stripe's `checkout.session.completed` webhook, using session metadata as the source of truth so it works regardless of client state.

### 1. Persist all booking inputs in the Stripe Checkout Session
Update `createBookingCheckout` (in `src/lib/payments.functions.ts`) to include on `metadata`:
- `planId`, `planLabel`, `planPrice`
- `startDate`, `startHour`
- `vehicleName`, `vehiclePlate`
- `addons` (JSON-stringified; keep under Stripe's 500-char metadata limit — spill to a compact form or store the array under a single key if needed)
- `addonsTotalCents`
- `userId`

Also pass `client_reference_id: userId` for redundancy.

### 2. New webhook route
Create `src/routes/api/public/payments/webhook.ts` (Stripe posts here). Use the existing `verifyWebhook` helper in `src/lib/stripe.server.ts` and the `?env=sandbox|live` query pattern already documented in the stripe-webhooks knowledge card.

Handle `checkout.session.completed`:
- Idempotency: `select` by `stripe_payment_intent_id`; if a row exists, return 200 without inserting.
- Load session metadata; reconstruct the booking payload (mirroring the current `checkout.return.tsx` insert).
- Resolve free_km/km_price_cents from `getPlanById(planId)`.
- Generate `pickup_code` server-side (same 6-char uppercase pattern).
- Insert into `bookings` via `supabaseAdmin` with `status: "paid"`.
- Delete matching `booking_holds` row.
- Fire `sendBookingConfirmation` and `sendAdminBookingNotification` (extract their bodies into `.server.ts` helpers so both the webhook and the current client path can call them, or just call the existing server fns directly with a service context).
- Insert `admin_notifications` row (which triggers the existing push).

### 3. Simplify `checkout.return.tsx`
- Remove the client-side insert entirely.
- Poll `bookings` by `stripe_payment_intent_id` (fetch via a new `getBookingBySessionId` server fn that calls Stripe to get the payment_intent from the session id, then queries the table) for up to ~15s. Show "Zahlung wird bestätigt…" during polling.
- On success, navigate to `/trip/$bookingId`.
- If polling times out, show a friendly message but reassure the user the booking will be created (webhook still fires); include support email.
- Drop the `mt_pending_booking` localStorage dependency.

### 4. Configuration
- Confirm the webhook secret exists (`PAYMENTS_LIVE_WEBHOOK_SECRET` and `PAYMENTS_SANDBOX_WEBHOOK_SECRET` are already set).
- The Lovable integration should auto-register the webhook endpoint URL; verify after deploy.

### 5. Backfill safety net (optional but recommended)
Add a small admin-only server fn or cron endpoint that lists Stripe `checkout.sessions` with `payment_status = paid` in the last 24h and inserts any missing `bookings`. Useful for one-off recovery.

## Risk & rollout
- Keep the client-side insert as a fallback for one release only, guarded by "if row not already present", then remove.
- Test end-to-end in sandbox: normal flow, tab-close-before-return, cross-browser return.
