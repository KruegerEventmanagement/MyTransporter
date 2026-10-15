CREATE TABLE public.customer_mail_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('booking','manual')),
  source_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('invoice','review_request')),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','processing','sent','failed','needs_review','blocked','cancelled')),
  due_at timestamptz NOT NULL,
  recipient_email text,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb,
  archive_id uuid,
  opt_out_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  ambiguous boolean NOT NULL DEFAULT false,
  error_kind text,
  last_error text,
  blocked_reason text,
  provider_message_id text,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, kind)
);
GRANT SELECT ON public.customer_mail_outbox TO authenticated;
GRANT ALL ON public.customer_mail_outbox TO service_role;
ALTER TABLE public.customer_mail_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read customer mail outbox" ON public.customer_mail_outbox
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX customer_mail_outbox_due_idx ON public.customer_mail_outbox (status, due_at);
CREATE TRIGGER customer_mail_outbox_updated_at BEFORE UPDATE ON public.customer_mail_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
COMMENT ON COLUMN public.customer_mail_outbox.payload IS 'Eingefrorener Sendeinhalt (from,to,reply_to,subject,html,text,attachment) – einmal gesetzt nie ändern.';

CREATE OR REPLACE FUNCTION public.customer_mail_outbox_immutable()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.payload IS NOT NULL AND NEW.payload IS DISTINCT FROM OLD.payload THEN
    RAISE EXCEPTION 'payload is immutable';
  END IF;
  IF OLD.recipient_email IS NOT NULL AND NEW.recipient_email IS DISTINCT FROM OLD.recipient_email THEN
    RAISE EXCEPTION 'recipient is immutable';
  END IF;
  IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.source_id IS DISTINCT FROM OLD.source_id OR NEW.source_type IS DISTINCT FROM OLD.source_type THEN
    RAISE EXCEPTION 'identity is immutable';
  END IF;
  IF OLD.status = 'sent' AND NEW.status IS DISTINCT FROM 'sent' THEN
    RAISE EXCEPTION 'sent is final';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customer_mail_outbox_immutable BEFORE UPDATE ON public.customer_mail_outbox
  FOR EACH ROW EXECUTE FUNCTION public.customer_mail_outbox_immutable();

CREATE TABLE public.customer_mail_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  google_review_url text CHECK (google_review_url IS NULL OR google_review_url ~ '^https://'),
  review_requests_from timestamptz,
  invoice_outbox_from timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, UPDATE ON public.customer_mail_settings TO authenticated;
GRANT ALL ON public.customer_mail_settings TO service_role;
ALTER TABLE public.customer_mail_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read mail settings" ON public.customer_mail_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update mail settings" ON public.customer_mail_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.customer_mail_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE public.email_opt_outs (
  email_lower text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('review_request')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email_lower, scope)
);
GRANT SELECT ON public.email_opt_outs TO authenticated;
GRANT ALL ON public.email_opt_outs TO service_role;
ALTER TABLE public.email_opt_outs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read opt outs" ON public.email_opt_outs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.claim_customer_mail(_id uuid, _lease_seconds integer, _safe_seconds integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r public.customer_mail_outbox; tok uuid := gen_random_uuid();
BEGIN
  SELECT * INTO r FROM public.customer_mail_outbox WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result','not_found'); END IF;
  IF r.status IN ('sent','cancelled','blocked','needs_review') THEN RETURN jsonb_build_object('result', r.status); END IF;
  IF r.payload IS NULL THEN RETURN jsonb_build_object('result','no_payload'); END IF;
  IF r.due_at > now() THEN RETURN jsonb_build_object('result','not_due'); END IF;
  IF r.status = 'processing' AND r.lease_until > now() THEN RETURN jsonb_build_object('result','in_progress'); END IF;
  IF (r.status = 'processing' OR r.ambiguous) AND r.first_attempt_at IS NOT NULL
     AND r.first_attempt_at < now() - make_interval(secs => _safe_seconds) THEN
    UPDATE public.customer_mail_outbox SET status = 'needs_review', lease_token = NULL, lease_until = NULL,
      last_error = COALESCE(last_error, 'Ergebnis unklar') || ' · sicheres Wiederholungsfenster abgelaufen'
    WHERE id = _id;
    RETURN jsonb_build_object('result','needs_review');
  END IF;
  IF r.status = 'failed' AND r.next_attempt_at IS NOT NULL AND r.next_attempt_at > now() THEN
    RETURN jsonb_build_object('result','backoff');
  END IF;
  UPDATE public.customer_mail_outbox SET
    status = 'processing', lease_token = tok, lease_until = now() + make_interval(secs => _lease_seconds),
    attempts = attempts + 1, first_attempt_at = COALESCE(first_attempt_at, now()), ambiguous = true
  WHERE id = _id;
  RETURN jsonb_build_object('result','claimed','lease_token',tok,'prior_ambiguous',r.ambiguous OR r.status = 'processing');
END $$;

CREATE OR REPLACE FUNCTION public.complete_customer_mail(_id uuid, _lease_token uuid, _provider_id text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF _provider_id IS NULL OR length(btrim(_provider_id)) = 0 THEN RETURN false; END IF;
  UPDATE public.customer_mail_outbox SET
    status = 'sent', provider_message_id = _provider_id, sent_at = now(), lease_until = NULL,
    lease_token = NULL, last_error = NULL, error_kind = NULL, ambiguous = false, next_attempt_at = NULL
  WHERE id = _id AND status = 'processing' AND lease_token = _lease_token;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.fail_customer_mail(_id uuid, _lease_token uuid, _kind text, _error text, _ambiguous boolean, _retry_seconds integer)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.customer_mail_outbox SET
    status = 'failed', error_kind = _kind, last_error = left(_error, 500), ambiguous = _ambiguous,
    lease_until = NULL, lease_token = NULL, next_attempt_at = now() + make_interval(secs => GREATEST(_retry_seconds, 60))
  WHERE id = _id AND status = 'processing' AND lease_token = _lease_token;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.release_customer_mail_for_retry(_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.customer_mail_outbox SET status = 'failed', ambiguous = false, next_attempt_at = now(),
    first_attempt_at = NULL, lease_token = NULL, lease_until = NULL
  WHERE id = _id AND status IN ('failed','needs_review') AND payload IS NOT NULL;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.claim_customer_mail(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_customer_mail(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_customer_mail(uuid, uuid, text, text, boolean, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_customer_mail_for_retry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_customer_mail(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_customer_mail(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_customer_mail(uuid, uuid, text, text, boolean, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_customer_mail_for_retry(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_reminder(_table text, _id uuid, _kind text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n int;
BEGIN
  IF _table = 'bookings' AND _kind = '24h' THEN
    UPDATE public.bookings SET reminder_24h_sent_at = now() WHERE id = _id AND reminder_24h_sent_at IS NULL;
  ELSIF _table = 'bookings' AND _kind = '30min' THEN
    UPDATE public.bookings SET reminder_30min_sent_at = now() WHERE id = _id AND reminder_30min_sent_at IS NULL;
  ELSIF _table = 'manual_reservations' AND _kind = '24h' THEN
    UPDATE public.manual_reservations SET reminder_24h_sent_at = now() WHERE id = _id AND reminder_24h_sent_at IS NULL;
  ELSIF _table = 'manual_reservations' AND _kind = '30min' THEN
    UPDATE public.manual_reservations SET reminder_30min_sent_at = now() WHERE id = _id AND reminder_30min_sent_at IS NULL;
  ELSE RAISE EXCEPTION 'invalid reminder target';
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END $$;
CREATE OR REPLACE FUNCTION public.release_reminder(_table text, _id uuid, _kind text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF _table = 'bookings' AND _kind = '24h' THEN
    UPDATE public.bookings SET reminder_24h_sent_at = NULL WHERE id = _id;
  ELSIF _table = 'bookings' AND _kind = '30min' THEN
    UPDATE public.bookings SET reminder_30min_sent_at = NULL WHERE id = _id;
  ELSIF _table = 'manual_reservations' AND _kind = '24h' THEN
    UPDATE public.manual_reservations SET reminder_24h_sent_at = NULL WHERE id = _id;
  ELSIF _table = 'manual_reservations' AND _kind = '30min' THEN
    UPDATE public.manual_reservations SET reminder_30min_sent_at = NULL WHERE id = _id;
  ELSE RAISE EXCEPTION 'invalid reminder target';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.claim_reminder(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_reminder(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reminder(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_reminder(text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION private.run_customer_mail_hook()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public AS $$
DECLARE v_token text; v_url text; v_base text; v_on text;
BEGIN
  SELECT value INTO v_on FROM private.app_config WHERE key = 'customer_mail_hook_enabled';
  IF v_on IS DISTINCT FROM 'true' THEN RETURN; END IF;
  SELECT value INTO v_token FROM private.app_config WHERE key = 'notify_hook_token';
  SELECT value INTO v_url FROM private.app_config WHERE key = 'notify_hook_url';
  IF v_token IS NULL OR v_url IS NULL THEN RETURN; END IF;
  v_base := regexp_replace(v_url, '/api/public/hooks/.*$', '');
  PERFORM net.http_post(
    url := v_base || '/api/public/hooks/process-customer-mails',
    headers := jsonb_build_object('Content-Type','application/json','x-hook-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
EXCEPTION WHEN OTHERS THEN RETURN;
END $$;
REVOKE ALL ON FUNCTION private.run_customer_mail_hook() FROM PUBLIC, anon, authenticated;
SELECT cron.unschedule('mt-process-customer-mails') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mt-process-customer-mails');
SELECT cron.schedule('mt-process-customer-mails', '7 * * * *', 'SELECT private.run_customer_mail_hook();');