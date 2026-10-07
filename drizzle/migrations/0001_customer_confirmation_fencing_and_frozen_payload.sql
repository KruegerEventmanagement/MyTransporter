ALTER TABLE public.manual_reservations
  ADD COLUMN IF NOT EXISTS create_request_id uuid,
  ADD COLUMN IF NOT EXISTS confirmation_requested boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS manual_reservations_create_request_id_key
  ON public.manual_reservations (create_request_id) WHERE create_request_id IS NOT NULL;

-- Sendeabsicht ist kein inhaltliches Merkmal: keine neue Revision/Owner-Mail nur dafür.
CREATE OR REPLACE FUNCTION public.manual_reservations_bump_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  ignored text[] := ARRAY['updated_at', 'revision', 'reminder_24h_sent_at', 'reminder_30min_sent_at', 'confirmation_requested', 'create_request_id'];
  old_j jsonb := (to_jsonb(OLD) - ignored);
  new_j jsonb := (to_jsonb(NEW) - ignored);
BEGIN
  IF old_j IS DISTINCT FROM new_j THEN
    NEW.revision := COALESCE(OLD.revision, 1) + 1;
  ELSE
    NEW.revision := COALESCE(OLD.revision, 1);
  END IF;
  RETURN NEW;
END;
$function$;

ALTER TABLE public.manual_reservation_customer_mails
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS sending_started_at timestamptz;
COMMENT ON COLUMN public.manual_reservation_customer_mails.payload IS 'Eingefrorener Sendeinhalt (from,to,reply_to,subject,html,text) je Revision – nie ändern.';

CREATE OR REPLACE FUNCTION public.customer_mail_payload_immutable()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.payload IS NOT NULL AND NEW.payload IS DISTINCT FROM OLD.payload THEN
    RAISE EXCEPTION 'payload is immutable';
  END IF;
  IF NEW.recipient_email IS DISTINCT FROM OLD.recipient_email OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'recipient/key are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customer_mail_payload_immutable
  BEFORE UPDATE ON public.manual_reservation_customer_mails
  FOR EACH ROW EXECUTE FUNCTION public.customer_mail_payload_immutable();

-- Claim mit Fencing-Token. Vor dem externen Aufruf wird der Versuch als unklar markiert.
CREATE OR REPLACE FUNCTION public.claim_customer_confirmation(_id uuid, _lease_seconds integer, _safe_seconds integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r public.manual_reservation_customer_mails; tok uuid := gen_random_uuid();
BEGIN
  SELECT * INTO r FROM public.manual_reservation_customer_mails WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result','not_found'); END IF;
  IF r.status = 'sent' THEN RETURN jsonb_build_object('result','sent'); END IF;
  IF r.payload IS NULL THEN RETURN jsonb_build_object('result','no_payload'); END IF;
  IF r.status = 'processing' AND r.lease_until > now() THEN
    RETURN jsonb_build_object('result','in_progress');
  END IF;
  -- Abgelaufene Lease oder früher unklarer Versuch: nur innerhalb des sicheren Idempotenzfensters.
  IF (r.status = 'processing' OR r.ambiguous) AND r.first_attempt_at IS NOT NULL
     AND r.first_attempt_at < now() - make_interval(secs => _safe_seconds) THEN
    RETURN jsonb_build_object('result','needs_review');
  END IF;
  UPDATE public.manual_reservation_customer_mails SET
    status = 'processing', lease_token = tok, lease_until = now() + make_interval(secs => _lease_seconds),
    attempts = attempts + 1, first_attempt_at = COALESCE(first_attempt_at, now()),
    sending_started_at = now(), ambiguous = true
  WHERE id = _id;
  RETURN jsonb_build_object('result','claimed','lease_token',tok,'prior_ambiguous',r.ambiguous OR r.status = 'processing');
END $$;

CREATE OR REPLACE FUNCTION public.complete_customer_confirmation(_id uuid, _lease_token uuid, _provider_id text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF _provider_id IS NULL OR length(btrim(_provider_id)) = 0 THEN RETURN false; END IF;
  UPDATE public.manual_reservation_customer_mails SET
    status = 'sent', provider_message_id = _provider_id, sent_at = now(), lease_until = NULL,
    lease_token = NULL, last_error = NULL, error_kind = NULL, ambiguous = false
  WHERE id = _id AND status = 'processing' AND lease_token = _lease_token;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.fail_customer_confirmation(_id uuid, _lease_token uuid, _kind text, _error text, _ambiguous boolean)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.manual_reservation_customer_mails SET
    status = 'failed', error_kind = _kind, last_error = left(_error, 500), ambiguous = _ambiguous,
    lease_until = NULL, lease_token = NULL
  WHERE id = _id AND status = 'processing' AND lease_token = _lease_token;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.claim_customer_confirmation(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_customer_confirmation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_customer_confirmation(uuid, uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_confirmation(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_customer_confirmation(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_customer_confirmation(uuid, uuid, text, text, boolean) TO service_role;