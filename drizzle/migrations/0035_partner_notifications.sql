-- lovable-cron-fallback-reviewed: retry job exists only while partner mails are pending; woken on enqueue, unschedules itself after drain
CREATE TABLE public.partner_signups (
  user_id uuid PRIMARY KEY,
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  visit_id uuid NOT NULL REFERENCES public.partner_visits(id),
  partner_slug text NOT NULL,
  visited_at timestamptz NOT NULL,
  user_created_at timestamptz NOT NULL,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_created_at >= visited_at - interval '5 minutes')
);
CREATE INDEX partner_signups_partner ON public.partner_signups (partner_id, attributed_at);
GRANT SELECT ON public.partner_signups TO authenticated;
GRANT ALL ON public.partner_signups TO service_role;
ALTER TABLE public.partner_signups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read partner signups" ON public.partner_signups FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER partner_signups_immutable BEFORE UPDATE OR DELETE ON public.partner_signups
FOR EACH ROW EXECUTE FUNCTION public.booking_partner_attributions_immutable();

CREATE TABLE public.partner_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE CHECK (length(event_key) <= 120),
  kind text NOT NULL CHECK (kind IN ('scan','signup','booking_paid','test')),
  partner_id uuid REFERENCES public.partners(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','needs_review')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  provider_id text,
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX partner_notifications_due ON public.partner_notifications (status, next_attempt_at);
CREATE INDEX partner_notifications_partner ON public.partner_notifications (partner_id, kind, created_at);
GRANT SELECT ON public.partner_notifications TO authenticated;
GRANT ALL ON public.partner_notifications TO service_role;
ALTER TABLE public.partner_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read partner notifications" ON public.partner_notifications FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.enqueue_partner_scan_notification(_visit_id uuid, _payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_partner uuid; v_h int; v_d int;
BEGIN
  SELECT partner_id INTO v_partner FROM partner_visits WHERE id = _visit_id;
  IF v_partner IS NULL THEN RETURN 'unknown'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('partner_scan_mail:' || v_partner::text));
  SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour'), count(*)
    INTO v_h, v_d FROM partner_notifications
    WHERE partner_id = v_partner AND kind = 'scan' AND created_at > now() - interval '1 day';
  IF v_h >= 10 OR v_d >= 50 THEN RETURN 'capped'; END IF;
  INSERT INTO partner_notifications (event_key, kind, partner_id, payload)
  VALUES ('scan:' || _visit_id::text, 'scan', v_partner, _payload)
  ON CONFLICT (event_key) DO NOTHING;
  RETURN 'queued';
END $$;

CREATE OR REPLACE FUNCTION public.claim_partner_notifications(_limit int, _lease_seconds int, _id uuid DEFAULT NULL)
RETURNS SETOF public.partner_notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE partner_notifications n SET status = 'sending', attempts = n.attempts + 1,
    lease_token = gen_random_uuid(), lease_until = now() + make_interval(secs => _lease_seconds)
  WHERE n.id IN (
    SELECT id FROM partner_notifications
    WHERE (_id IS NULL OR id = _id)
      AND ((status IN ('pending','failed') AND next_attempt_at <= now())
        OR (status = 'sending' AND lease_until < now()))
      AND attempts < 8
    ORDER BY created_at LIMIT greatest(1, least(_limit, 50))
    FOR UPDATE SKIP LOCKED)
  RETURNING n.*;
END $$;

CREATE OR REPLACE FUNCTION public.finish_partner_notification(_id uuid, _lease_token uuid, _status text, _provider_id text, _error text, _retry_seconds int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int;
BEGIN
  IF _status NOT IN ('sent','failed','needs_review') THEN RAISE EXCEPTION 'bad status'; END IF;
  UPDATE partner_notifications SET status = _status, provider_id = coalesce(_provider_id, provider_id),
    last_error = left(_error, 300), lease_token = NULL, lease_until = NULL,
    sent_at = CASE WHEN _status = 'sent' THEN now() ELSE sent_at END,
    next_attempt_at = now() + make_interval(secs => greatest(0, _retry_seconds))
  WHERE id = _id AND lease_token = _lease_token AND status = 'sending';
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v = 1;
END $$;

REVOKE ALL ON FUNCTION public.enqueue_partner_scan_notification(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_partner_notifications(int, int, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_partner_notification(uuid, uuid, text, text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_partner_scan_notification(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_partner_notifications(int, int, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_partner_notification(uuid, uuid, text, text, text, int) TO service_role;

-- Weckt den Versandlauf; Wiederholungsjob existiert nur, solange etwas offen ist.
CREATE OR REPLACE FUNCTION private.run_partner_notification_hook()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'private', 'public' AS $$
DECLARE v_token text; v_url text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.partner_notifications WHERE status IN ('pending','failed','sending') AND attempts < 8) THEN
    BEGIN PERFORM cron.unschedule('mt-partner-notify-retry'); EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN;
  END IF;
  SELECT value INTO v_token FROM private.app_config WHERE key = 'notify_hook_token';
  SELECT value INTO v_url FROM private.app_config WHERE key = 'notify_hook_url';
  IF v_token IS NULL OR v_url IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := regexp_replace(v_url, '/api/public/hooks/.*$', '') || '/api/public/hooks/process-partner-notifications',
    headers := jsonb_build_object('Content-Type','application/json','x-hook-token', v_token),
    body := '{}'::jsonb, timeout_milliseconds := 20000);
EXCEPTION WHEN OTHERS THEN RETURN;
END $$;

CREATE OR REPLACE FUNCTION private.wake_partner_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'private', 'public' AS $$
BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mt-partner-notify-retry') THEN
      PERFORM cron.schedule('mt-partner-notify-retry', '*/5 * * * *', 'SELECT private.run_partner_notification_hook();');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM private.run_partner_notification_hook();
  RETURN NULL;
END $$;
CREATE TRIGGER partner_notifications_wake AFTER INSERT ON public.partner_notifications
FOR EACH STATEMENT EXECUTE FUNCTION private.wake_partner_notifications();