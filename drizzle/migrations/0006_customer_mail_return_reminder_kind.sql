ALTER TABLE public.customer_mail_outbox DROP CONSTRAINT IF EXISTS customer_mail_outbox_kind_check;
ALTER TABLE public.customer_mail_outbox ADD CONSTRAINT customer_mail_outbox_kind_check
  CHECK (kind IN ('invoice','review_request','reminder_24h','reminder_30min','return_reminder'));