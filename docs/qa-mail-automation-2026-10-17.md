# Mail automation preparation — 17 October 2026

## Safety and verification
No external send, test mail, queue replay, customer booking, payment or deployment was performed. Read-only connector profile verified `info@mytransporter.org`; linked Google Mail connection uses gateway-backed server runtime, with granted Gmail send scope. Sender is MIME-encoded `Christian Krüger – MyTransporter <info@mytransporter.org>`, Reply-To same address. Real Gmail acceptance/delivery, visible display-name behavior, quota and Workspace billing are not verified. No purchase or upgrade occurred.

Both `GMAIL_SEND_RELEASED` and `RESEND_FALLBACK_RELEASED` are false. Merely connecting or setting an environment provider name cannot activate mail. Historical provider bindings cannot change in place. Legacy Resend attempts are NOT silently migrated to Gmail. Calendar/owner notification transport is preserved as legacy-bound and remains gated; enabling Gmail alone will not enable its legacy queue.

## Changes
- `src/lib/gmail-mail-provider.server.ts`: authenticated-account read-only check before POST, MIME/PDF transport, persistent payload hash and independent Gmail lease/fence. Definite 4xx rejection can retry after backoff; 408/409/5xx/network loss, missing ID, crash and lost completion remain ambiguous and cannot automatically resend. No automatic provider fallback.
- `src/lib/mail-provider.ts`, `mail-provider.server.ts`: explicit provider argument and separate release gates.
- `src/lib/customer-mail-outbox.ts`, `customer-mail-outbox.server.ts`: immutable provider binding for new intents; existing intents remain Resend; current status/end checks for return mail, DB errors fail closed. Review consent/opt-out remain current preconditions; invoice independent.
- `src/lib/manual-confirmation.server.ts`, `booking-email-recovery.server.ts`: provider-bound confirmation, independent online/manual invoice retry, sequential recovery to respect outbound concurrency limits.
- `src/lib/admin-documents.functions.ts`: explicit Gmail transport with archived-document-based stable key; no direct Resend API call for this send path.
- `src/lib/return-notice.ts`, `return-reminder-mail.server.ts`: return mail due timestamp end minus 30 minutes; online plus requested manual customer reservations; expires at end, excludes completed returns, detailed exterior/interior/instrument/receipt photo list; existing 30 EUR fee only after manual review, technical failures excluded. Popup and ten-minute push timing unchanged.
- `src/lib/birthday.server.ts`, `src/routes/api/public/hooks/send-birthday-emails.ts`: promotional sending disabled; endpoint fails closed without token, no force bypass. Existing customer-specific coupon validation and redemption unchanged.
- Existing customer-mail hook documented as prepared five-minute sweep; schedule remains inactive and `review_requests_from` NULL. No new jobs or cron expansion.
- Regression files: `gmail-mail-provider.test.ts`, `gmail-mail-ledger-sql.test.ts`, `birthday-send-disabled.test.ts`, `return-notice.test.ts`, provider/manual/outbox Resend-isolation tests.
- Root AGENTS mail safety rule and roadmap updated.

## Applied migrations
- `drizzle/migrations/0010_gmail_mail_attempt_ledger.sql`: server-only attempt ledger, grants/RLS, claim/complete/fail fencing RPCs, immutable provider binding columns. Tested with the actual migration in PGlite.
- `drizzle/migrations/0011_mail_active_account_service_grant.sql`: restores existing read-only active-account guard access for service-role mail eligibility; no privacy-rule change. Read-only database check had shown permission denied before this repair.

## Aggregate-only retrospective inspection
- Online confirmations in conservative recent (<23h), future-rental window without successful/ambiguous send: **0** (before account eligibility check; zero unchanged by further filtering).
- Manual requested confirmations in conservative recent/future window without successful/ambiguous send: **0**.
- Archived booking invoice first versions without recorded successful/ambiguous invoice send: **10 review candidates**, not authorization to send. Four current invoice outbox rows are blocked; eligibility/recipient/archive and cancellation context require individual review before any release. Never rebuild historical invoice content or resend confirmations with old access instructions.
- Documented, unsent review consents without recorded review opt-out: **2 potential candidates**, not approved sends; activation-date, current consent/recipient/source checks still apply. Review start remains NULL.
- Documented birthday marketing opt-ins: **0**. Birthday backfill/sending: **0**, unsupported in app-email service.
- No rows were inserted or replayed for retrospective work.

## Tests / limitations
831 tests passed (71 files), including actual PostgreSQL migration tests for parallel claim, expired lease/crash, provider binding, definitive retry, ambiguous 5xx, persisted ID and stale completion. Automatic preview build/typecheck reported build OK after source changes; no manual build/typecheck was run.

The return trigger is due at end−30 minutes, but existing one-minute polling and Gmail delivery cannot guarantee an exact delivery second. Existing future retries run only through configured protected jobs; customer-mail sweep remains inactive pending explicit release. A missed return window never causes mail after end.

Birthday discount emails are marketing and cannot be implemented through this app-mail service; use a dedicated marketing service. Existing coupons are preserved, not expanded to a new campaign or validity period.

This is a gated preparation, NOT an activated or verified production rollout. Review, explicit send release, safe historical-provider treatment, approved publication and a separately authorized internal live acceptance check remain outstanding. Other unrelated inquiry/test endpoints were not converted to a universal all-mail outbox; do not claim full migration of every project email path.
