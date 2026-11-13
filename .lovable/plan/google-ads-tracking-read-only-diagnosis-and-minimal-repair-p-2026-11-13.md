# Google Ads tracking: read-only diagnosis and minimal repair proposal

## Findings (verified in code)

**IDs in code**
- Google Ads tag: `AW-18092739278` (`src/lib/analytics.ts` line 20). It matches the ID in the Ads UI.
- Code comment names conversion action "MyTransporter – Buchung" (ID 7734092772).
- Purchase label is read from `VITE_GOOGLE_ADS_PURCHASE_LABEL`. `.env` sets it to `CtNCCOTH8-ccEM6VpbND`, so the event goes to `AW-18092739278/CtNCCOTH8-ccEM6VpbND`. I have not checked which Ads conversion action owns this label. It may not be the "Subscribe" primary goal.
- No GA4 (`G-...`) or GTM (`GTM-...`) ID anywhere in `src/` or `public/`. Meta Pixel and Microsoft UET are present.

**Consent** (`src/lib/analytics.ts`, `src/components/CookieConsent.tsx`, mounted in `src/routes/__root.tsx`)
- Choice is stored in localStorage `mt_consent_v1` as `necessary` or `marketing`.
- `gtag.js` loads only after the user picks marketing. Before it loads, Consent Mode v2 defaults are set to denied, then updated to granted.
- If a visitor declines or ignores the banner, there is no tag on the page and no consent-mode pings. That is why Google's tag check and crawler report "no tag", and why most conversions go uncounted.
- `config` uses `send_page_view: false`, so even consenting visitors send no page view. This makes tag detection weaker still.

**Paid booking path**
- Stripe Checkout returns to `/checkout/return?session_id=...` (`src/routes/checkout.return.tsx`), which polls `getBookingBySessionId` (`src/lib/payments.functions.ts` lines 108-166).
- The server checks `paid` = Stripe `payment_status === "paid"` AND a booking row exists that is not pending (written by the webhook).
- Value = `plan_price + addons_total_cents/100`. The refundable deposit is excluded.
- `transactionId` = Stripe PaymentIntent ID.
- `trackPurchase` sends one `conversion` event with `value`, `currency`, `transaction_id`. Duplicates are blocked per session and in localStorage `mt_google_conversions_sent`. If consent is given later in the same session, the event is sent then.
- Other events: `booking_start`, `checkout_start`, `phone_click`, `sign_up`. These are plain gtag events, not Ads conversions. Nothing in the code sends a "subscribe" event or label.

## Likely causes
1. The tag is missing until marketing consent, so the Ads tag check fails.
2. The primary goal "Subscribe" probably points at a different conversion action/label than `CtNCCOTH8-ccEM6VpbND`. To be confirmed in the account.

## Proposed minimal repair (after you confirm send_to)
1. Load `gtag.js` for `AW-18092739278` on every page right after hydration, with Consent Mode v2 defaults set to **denied** first (advanced consent mode). Before consent, only cookieless pings are sent. Ad cookies and the conversion still need `marketing`. The existing banner, storage key and grant/withdraw updates stay as they are. Meta and Microsoft keep loading only after consent.
2. Allow the default page view (drop `send_page_view: false`) so Google detects the tag.
3. Put the confirmed label in `VITE_GOOGLE_ADS_PURCHASE_LABEL` (replacing the current one only if it is wrong). Keep the single purchase event on `/checkout/return` with PaymentIntent ID and rental value excluding the deposit, and keep the existing dedupe.
4. Update the privacy page text to describe cookieless pings before consent. Update `src/lib/analytics.test.ts`: one test that the tag loads with denied defaults before consent, and one that the conversion fires only once per transaction and only with consent.
5. In Google Ads, set the booking purchase action as primary and make "Subscribe" secondary or remove it. This is done in the account, not in code.

## Open question
- Which conversion action and label should `send_to` use? The current label is `CtNCCOTH8-ccEM6VpbND`.
- Is cookieless pre-consent loading (advanced mode) acceptable for your legal setup? If not, only steps 2 and 3 apply, and the tag check will keep failing for visitors who decline.
