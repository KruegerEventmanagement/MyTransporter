CREATE TABLE public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  type text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','processed','failed')),
  attempts integer NOT NULL DEFAULT 1,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
GRANT ALL ON public.stripe_webhook_events TO service_role;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.stripe_refunds (
  refund_id text PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  payment_intent_id text,
  charge_id text,
  booking_id uuid,
  settlement_id uuid,
  origin text NOT NULL CHECK (origin IN ('app_settlement','app_conflict','external')),
  allocation text NOT NULL CHECK (allocation IN ('deposit','cancellation','legacy','conflict','unallocated')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text,
  status text NOT NULL,
  failure_reason text,
  reason text,
  stripe_created_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  admin_notified_at timestamptz
);
CREATE INDEX stripe_refunds_pi_idx ON public.stripe_refunds(payment_intent_id);
CREATE INDEX stripe_refunds_booking_idx ON public.stripe_refunds(booking_id);
GRANT SELECT ON public.stripe_refunds TO authenticated;
GRANT ALL ON public.stripe_refunds TO service_role;
ALTER TABLE public.stripe_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read stripe refunds" ON public.stripe_refunds
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Monotone Übernahme eines frisch von Stripe gelesenen Refunds (pro refund_id).
-- Ältere Snapshots (außer-der-Reihe-Events) stufen den Status nie zurück.
CREATE OR REPLACE FUNCTION public.upsert_stripe_refund(
  _refund_id text, _environment text, _payment_intent_id text, _charge_id text,
  _booking_id uuid, _settlement_id uuid, _origin text, _allocation text,
  _amount_cents integer, _currency text, _status text, _failure_reason text, _reason text, _stripe_created_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old public.stripe_refunds%ROWTYPE;
  v_rank_old int; v_rank_new int;
  v_inserted boolean := false;
BEGIN
  SELECT * INTO v_old FROM public.stripe_refunds WHERE refund_id = _refund_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.stripe_refunds(refund_id, environment, payment_intent_id, charge_id, booking_id, settlement_id, origin, allocation,
      amount_cents, currency, status, failure_reason, reason, stripe_created_at)
    VALUES (_refund_id, _environment, _payment_intent_id, _charge_id, _booking_id, _settlement_id, _origin, _allocation,
      _amount_cents, _currency, _status, _failure_reason, _reason, _stripe_created_at)
    ON CONFLICT (refund_id) DO NOTHING;
    IF FOUND THEN
      RETURN jsonb_build_object('inserted', true, 'status', _status, 'notify', _origin = 'external');
    END IF;
    SELECT * INTO v_old FROM public.stripe_refunds WHERE refund_id = _refund_id FOR UPDATE;
  END IF;
  v_rank_old := CASE WHEN v_old.status IN ('failed','canceled') THEN 3 WHEN v_old.status = 'succeeded' THEN 2 ELSE 1 END;
  v_rank_new := CASE WHEN _status IN ('failed','canceled') THEN 3 WHEN _status = 'succeeded' THEN 2 ELSE 1 END;
  UPDATE public.stripe_refunds SET
    status = CASE WHEN v_rank_new >= v_rank_old THEN _status ELSE status END,
    failure_reason = CASE WHEN v_rank_new >= v_rank_old THEN _failure_reason ELSE failure_reason END,
    booking_id = COALESCE(booking_id, _booking_id),
    settlement_id = COALESCE(settlement_id, _settlement_id),
    charge_id = COALESCE(charge_id, _charge_id),
    updated_at = now()
  WHERE refund_id = _refund_id;
  RETURN jsonb_build_object('inserted', false, 'status', CASE WHEN v_rank_new >= v_rank_old THEN _status ELSE v_old.status END,
    'notify', v_old.origin = 'external' AND v_old.admin_notified_at IS NULL);
END $$;
REVOKE ALL ON FUNCTION public.upsert_stripe_refund(text,text,text,text,uuid,uuid,text,text,integer,text,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_stripe_refund(text,text,text,text,uuid,uuid,text,text,integer,text,text,text,text,timestamptz) TO service_role;

-- Event-Dedupe: 'new' | 'duplicate' (bereits verarbeitet) | 'busy' (läuft gerade parallel)
CREATE OR REPLACE FUNCTION public.claim_stripe_event(_event_id text, _environment text, _type text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.stripe_webhook_events%ROWTYPE;
BEGIN
  INSERT INTO public.stripe_webhook_events(event_id, environment, type) VALUES (_event_id, _environment, _type)
  ON CONFLICT (event_id) DO NOTHING;
  IF FOUND THEN RETURN 'new'; END IF;
  SELECT * INTO v FROM public.stripe_webhook_events WHERE event_id = _event_id FOR UPDATE;
  IF v.status = 'processed' THEN RETURN 'duplicate'; END IF;
  IF v.status = 'processing' AND v.received_at > now() - interval '2 minutes' THEN RETURN 'busy'; END IF;
  UPDATE public.stripe_webhook_events SET status = 'processing', attempts = attempts + 1, received_at = now() WHERE event_id = _event_id;
  RETURN 'new';
END $$;
REVOKE ALL ON FUNCTION public.claim_stripe_event(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text,text,text) TO service_role;

-- Stündlicher read-only Abgleich offener Erstattungen und neuer Stripe-Refunds.
CREATE OR REPLACE FUNCTION private.run_refund_sync_hook()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'private', 'public' AS $$
DECLARE v_token text; v_url text; v_base text;
BEGIN
  SELECT value INTO v_token FROM private.app_config WHERE key = 'notify_hook_token';
  SELECT value INTO v_url FROM private.app_config WHERE key = 'notify_hook_url';
  IF v_token IS NULL OR v_url IS NULL THEN RETURN; END IF;
  v_base := regexp_replace(v_url, '/api/public/hooks/.*$', '');
  PERFORM net.http_post(
    url := v_base || '/api/public/hooks/sync-deposit-refunds?token=' || v_token,
    headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 30000);
EXCEPTION WHEN OTHERS THEN RETURN;
END $$;
SELECT cron.schedule('mt-sync-deposit-refunds', '7 * * * *', 'SELECT private.run_refund_sync_hook();');