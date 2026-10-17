# Booking email repair — 17 October 2026

## Production evidence (read-only)

- Actual provider: direct Resend HTTP API, `POST https://api.resend.com/emails`, runtime `RESEND_API_KEY`. No accessible Resend connector and no Lovable Emails domain configured. No provider switch performed.
- Customer From: `Christian Krüger – MyTransporter <info@mytransporter.org>`; manual From: `MyTransporter <info@mytransporter.org>`; Reply-To and admin recipient: `info@mytransporter.org`. The existing owner-notification/calendar formatting is unchanged.
- Online: verified Stripe webhook → `reconcileBookingPostActions` → independent confirmation/invoice/admin actions. Browser is not the required sender.
- Latest actual failures on 17 October: Resend HTTP 401, `validation_error`, `API key is invalid`, on both customer confirmation and admin booking mail. 14 failed customer-confirmation actions and 14 failed admin-mail actions exist; these are genuine mail failures, not inferred from owner-notification failures.
- `manual_reservation_notifications`: 16 failed rows, but 15 have `mail_sent_at`; their remaining failure is invalid VAPID configuration. One owner mail remains failed. These rows are owner/calendar-related notifications, not customer-confirmation records. No customer-confirmation rows were present at inspection.
- The invoice/review sweep remains inactive; it is not a confirmation recovery system and was not enabled by this repair.

## Repairs

- Migrations 0007/0008 applied: email-only immutable intent snapshots atomically accompany future paid booking insertion/status transition and explicitly requested manual revisions. No historical backfill. Unrelated updates to an already-requested revision do not replay it.
- Online confirmation/admin payloads use the existing durable fenced customer-mail outbox, retaining the old provider keys. Recipient, sender, subject and body remain identical across retries. Accepted provider IDs persist separately from failures; no terminal cancellation/review state is claimed as successful sending.
- Manual confirmations retain their existing per-revision outbox/fencing; frozen intent snapshots survive lost requests and subsequent edits. Database-enforced backoff added. Ambiguous attempts outside 23 hours remain for review rather than blind resend.
- New protected recovery endpoint processes only new intents; existing protected 15-minute booking-reminder hook calls the same email-only recovery independently of its other work. No new periodic job, no invoice/review replay, no change to calendar processing.
- Existing customer-mail prechecks now also protect confirmations from sending after cancellation/inactive account. Admin mail does not depend on customer-account activity.
- Confirmation dates use the existing Berlin booking-window formatter.
- `AGENTS.md` updated within its size budget.

## Files

`booking-email-recovery.server.ts`, `booking-emails.server.ts`, `booking-actions.server.ts`, `manual-confirmation.server.ts`, `customer-mail-outbox.ts`, `customer-mail-outbox.server.ts`, `hooks/process-booking-emails.ts`, `hooks/send-reminders.ts`; migration files 0007/0008 and isolated regression tests.

## Provider/domain and cost limitations

- No secrets read, rotated, displayed, or requested. Existing key rejection is established by fresh production logs, not a new provider send.
- Public DNS: root MX points to Google; Resend DKIM record exists; no root SPF/DMARC returned. DNS is not proof of Resend account verification; provider account verification and actual quota/billing remain unverified without authorized account access.
- Resend publicly lists Free: $0/month, 3,000 transactional emails/month, maximum 100/day ([pricing](https://resend.com/pricing)). A paid upgrade is not established by the current 401 error. No purchase/plan change performed.
- Owner must replace the rejected `RESEND_API_KEY` in Project Settings → Secrets, verify `mytransporter.org` and available quota in their Resend account, then publish reviewed code. Do not activate/replay historical queues as part of that step.

## Verification scope

- All provider tests use mocks and synthetic recipients; migration tests run against isolated PGlite, not production bookings.
- New recovery endpoint returns 401 without the hook token; public homepage still renders.
- Backend verification: intent table empty after migration; no real booking/payment/customer mail/replay initiated.
- Automatic harness typecheck/production build reported `build OK`; full suite: 67 files, 794 tests passed.
- Live inbox delivery is deliberately not tested. Provider acceptance does not establish delivery. Runtime secret/domain prerequisites and publication remain external blockers; this is not a claim that emails already work in production.