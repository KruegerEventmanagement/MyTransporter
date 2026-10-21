DO $$ DECLARE c text; BEGIN
 SELECT conname INTO c FROM pg_constraint WHERE conrelid='public.customer_mail_outbox'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%kind = ANY%';
 EXECUTE format('ALTER TABLE public.customer_mail_outbox DROP CONSTRAINT %I', c);
END $$;
ALTER TABLE public.customer_mail_outbox ADD CONSTRAINT customer_mail_outbox_kind_check CHECK (kind = ANY (ARRAY['invoice','review_request','reminder_24h','reminder_30min','return_reminder','return_overdue_1','return_overdue_2','booking_confirmation','admin_booking','deposit_review_admin','deposit_digest','deposit_closing']));