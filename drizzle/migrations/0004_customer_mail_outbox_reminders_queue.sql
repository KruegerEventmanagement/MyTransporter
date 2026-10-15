ALTER TABLE public.customer_mail_outbox DROP CONSTRAINT IF EXISTS customer_mail_outbox_kind_check;
ALTER TABLE public.customer_mail_outbox ADD CONSTRAINT customer_mail_outbox_kind_check
  CHECK (kind IN ('invoice','review_request','reminder_24h','reminder_30min'));
ALTER TABLE public.customer_mail_outbox ADD COLUMN IF NOT EXISTS expires_at timestamptz;
COMMENT ON COLUMN public.customer_mail_outbox.expires_at IS 'Nach diesem Zeitpunkt wird nicht mehr gesendet (z. B. Erinnerung nach Abholbeginn).';

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
  IF r.expires_at IS NOT NULL AND r.expires_at <= now() THEN
    UPDATE public.customer_mail_outbox SET
      status = CASE WHEN r.ambiguous OR r.status = 'processing' THEN 'needs_review' ELSE 'cancelled' END,
      blocked_reason = 'Versandzeitraum abgelaufen', lease_token = NULL, lease_until = NULL
    WHERE id = _id;
    RETURN jsonb_build_object('result','expired');
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

-- Nur wirklich bearbeitbare Zeilen (keine Backoffs, keine aktiven Leases) – älteste zuerst.
CREATE OR REPLACE FUNCTION public.customer_mail_due_ids(_limit integer)
 RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT id FROM public.customer_mail_outbox
   WHERE due_at <= now() AND payload IS NOT NULL
     AND ( status = 'scheduled'
        OR (status = 'failed' AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
        OR (status = 'processing' AND (lease_until IS NULL OR lease_until <= now())) )
   ORDER BY due_at, id
   LIMIT GREATEST(LEAST(_limit, 200), 1)
$$;

-- Anti-Join: Buchungen ohne Outbox-Eintrag dieser Art (keine 200er-Grenze ab Startdatum).
CREATE OR REPLACE FUNCTION public.customer_mail_missing_bookings(_kind text, _from timestamptz, _limit integer)
 RETURNS TABLE (id uuid, created_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT b.id, b.created_at FROM public.bookings b
   WHERE b.created_at >= _from
     AND b.status IN ('paid','active','in_progress','picked_up','returning','completed')
     AND NOT EXISTS (SELECT 1 FROM public.customer_mail_outbox o
                      WHERE o.source_type = 'booking' AND o.source_id = b.id AND o.kind = _kind)
   ORDER BY b.created_at, b.id
   LIMIT GREATEST(LEAST(_limit, 200), 1)
$$;

CREATE OR REPLACE FUNCTION public.customer_mail_missing_manual(_kind text, _from timestamptz, _limit integer)
 RETURNS TABLE (id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT DISTINCT m.reservation_id FROM public.manual_reservation_customer_mails m
   JOIN public.manual_reservations r ON r.id = m.reservation_id
   WHERE m.status = 'sent' AND r.created_at >= _from
     AND NOT EXISTS (SELECT 1 FROM public.customer_mail_outbox o
                      WHERE o.source_type = 'manual' AND o.source_id = m.reservation_id AND o.kind = _kind)
   LIMIT GREATEST(LEAST(_limit, 200), 1)
$$;

REVOKE ALL ON FUNCTION public.customer_mail_due_ids(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_mail_missing_bookings(text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_mail_missing_manual(text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_mail_due_ids(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_mail_missing_bookings(text, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_mail_missing_manual(text, timestamptz, integer) TO service_role;