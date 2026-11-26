CREATE OR REPLACE FUNCTION public.claim_partner_notifications(_limit int, _lease_seconds int, _id uuid DEFAULT NULL)
RETURNS SETOF public.partner_notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Letzter Versuch mit abgelaufener Lease: Ausgang unbekannt ⇒ nie erneut senden, sondern prüfen lassen.
  UPDATE partner_notifications SET status = 'needs_review', lease_token = NULL, lease_until = NULL,
    last_error = left(coalesce(last_error || ' · ', '') || 'Lease abgelaufen nach letztem Versuch', 300)
  WHERE status = 'sending' AND lease_until < now() AND attempts >= 8;
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
REVOKE ALL ON FUNCTION public.claim_partner_notifications(int, int, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_partner_notifications(int, int, uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.run_partner_notification_hook()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'private', 'public' AS $$
DECLARE v_token text; v_url text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.partner_notifications
                 WHERE (status IN ('pending','failed') AND attempts < 8) OR status = 'sending') THEN
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