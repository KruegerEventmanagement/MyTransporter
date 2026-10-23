DO $$ DECLARE c text; BEGIN
 SELECT conname INTO c FROM pg_constraint WHERE conrelid='public.customer_mail_outbox'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%kind = ANY%';
 EXECUTE format('ALTER TABLE public.customer_mail_outbox DROP CONSTRAINT %I', c);
END $$;
ALTER TABLE public.customer_mail_outbox ADD CONSTRAINT customer_mail_outbox_kind_check CHECK (kind = ANY (ARRAY['invoice','review_request','reminder_24h','reminder_30min','return_reminder','return_overdue_1','return_overdue_2','booking_confirmation','admin_booking','deposit_review_admin','deposit_digest','deposit_closing','feedback_request']));

ALTER TABLE public.customer_mail_settings ADD COLUMN IF NOT EXISTS feedback_requests_from timestamptz;

CREATE TABLE public.marketing_consent_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_lower text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('feedback','birthday')),
  method text NOT NULL CHECK (method IN ('phone')),
  statement text NOT NULL,
  attested_by uuid,
  attested_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_lower, scope)
);
GRANT SELECT ON public.marketing_consent_attestations TO authenticated;
GRANT ALL ON public.marketing_consent_attestations TO service_role;
ALTER TABLE public.marketing_consent_attestations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read attestations" ON public.marketing_consent_attestations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.marketing_consent_attestations_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RAISE EXCEPTION 'Einwilligungsnachweise sind unveränderlich'; END $$;
CREATE TRIGGER marketing_consent_attestations_immutable BEFORE UPDATE OR DELETE ON public.marketing_consent_attestations
  FOR EACH ROW EXECUTE FUNCTION public.marketing_consent_attestations_immutable();

CREATE TABLE public.customer_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('thanks')),
  email_lower text NOT NULL,
  user_id uuid,
  discount_percent integer NOT NULL CHECK (discount_percent BETWEEN 1 AND 50),
  valid_from date NOT NULL,
  valid_until date NOT NULL,
  source_type text,
  source_id uuid,
  reserved_until timestamptz,
  reserved_by uuid,
  redeemed_at timestamptz,
  redeemed_booking_id uuid,
  discount_cents integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_lower, kind)
);
GRANT SELECT ON public.customer_coupons TO authenticated;
GRANT ALL ON public.customer_coupons TO service_role;
ALTER TABLE public.customer_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read coupons" ON public.customer_coupons FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners read own coupons" ON public.customer_coupons FOR SELECT TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.birthday_campaigns ADD COLUMN IF NOT EXISTS reserved_until timestamptz;
ALTER TABLE public.birthday_campaigns ADD COLUMN IF NOT EXISTS reserved_by uuid;

CREATE TABLE public.customer_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL UNIQUE,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  liked text,
  disliked text,
  ideas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.customer_feedback TO authenticated;
GRANT ALL ON public.customer_feedback TO service_role;
ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read feedback" ON public.customer_feedback FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION private.run_birthday_hook() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public AS $$
DECLARE v_token text; v_url text; v_base text;
BEGIN
  SELECT value INTO v_token FROM private.app_config WHERE key = 'notify_hook_token';
  SELECT value INTO v_url FROM private.app_config WHERE key = 'notify_hook_url';
  IF v_token IS NULL OR v_url IS NULL THEN RETURN; END IF;
  v_base := regexp_replace(v_url, '/api/public/hooks/.*$', '');
  PERFORM net.http_post(
    url := v_base || '/api/public/hooks/send-birthday-emails',
    headers := jsonb_build_object('Content-Type','application/json','x-hook-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
EXCEPTION WHEN OTHERS THEN RETURN;
END $$;