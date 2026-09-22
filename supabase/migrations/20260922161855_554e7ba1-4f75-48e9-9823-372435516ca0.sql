-- lovable-cron-fallback-reviewed: Nachhol-Lauf nur als Backstop für fehlgeschlagene Owner-Benachrichtigungen; Sofortversand erfolgt event-getrieben beim Speichern. 96 Läufe/Tag, mit dem Nutzer abgestimmt.
ALTER TABLE public.manual_reservation_notifications
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS mail_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.manual_reservation_notification_payload(_row manual_reservations)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'reservation_id', _row.id,
    'source_type', 'manual_reservation',
    'revision', _row.revision,
    'vehicle_id', _row.vehicle_id,
    'vehicle_plate', _row.vehicle_plate,
    'vehicle_name', _row.vehicle_name,
    'start_at', to_char(_row.start_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'end_at', to_char(_row.end_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'customer_name', _row.customer_name,
    'customer_phone', _row.customer_phone,
    'customer_email', _row.customer_email,
    'created_at', to_char(_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'updated_at', to_char(_row.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
$function$;

UPDATE public.manual_reservation_notifications
   SET payload = payload - 'note'
 WHERE status <> 'succeeded' AND payload ? 'note';

CREATE OR REPLACE FUNCTION public.claim_manual_notifications(_limit integer DEFAULT 10, _lease_seconds integer DEFAULT 120)
 RETURNS SETOF manual_reservation_notifications
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.manual_reservation_notifications n
     SET status = 'pending',
         attempts = n.attempts + 1,
         lease_token = gen_random_uuid(),
         lease_until = now() + make_interval(secs => GREATEST(COALESCE(_lease_seconds, 120), 10)),
         updated_at = now()
   WHERE n.id IN (
     SELECT c.id
       FROM public.manual_reservation_notifications c
      WHERE c.status <> 'succeeded'
        AND (c.next_retry_at IS NULL OR c.next_retry_at <= now())
        AND (c.lease_until IS NULL OR c.lease_until < now())
      ORDER BY c.created_at
      LIMIT GREATEST(COALESCE(_limit, 10), 1)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING n.*;
$function$;

CREATE OR REPLACE FUNCTION public.complete_manual_notification(_id uuid, _push_sent boolean DEFAULT false, _lease_token uuid DEFAULT NULL)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH upd AS (
    UPDATE public.manual_reservation_notifications
       SET status = 'succeeded',
           succeeded_at = COALESCE(succeeded_at, now()),
           mail_sent_at = COALESCE(mail_sent_at, now()),
           lease_until = NULL,
           lease_token = NULL,
           next_retry_at = NULL,
           last_error = NULL,
           push_sent_at = CASE WHEN _push_sent THEN COALESCE(push_sent_at, now()) ELSE push_sent_at END,
           updated_at = now()
     WHERE id = _id
       AND (_lease_token IS NULL OR lease_token IS NOT DISTINCT FROM _lease_token)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$function$;

CREATE OR REPLACE FUNCTION public.mark_manual_notification_pushed(_id uuid, _lease_token uuid DEFAULT NULL)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH upd AS (
    UPDATE public.manual_reservation_notifications
       SET push_sent_at = COALESCE(push_sent_at, now()),
           updated_at = now()
     WHERE id = _id
       AND (_lease_token IS NULL OR lease_token IS NOT DISTINCT FROM _lease_token)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$function$;

CREATE OR REPLACE FUNCTION public.mark_manual_notification_mailed(_id uuid, _lease_token uuid DEFAULT NULL)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH upd AS (
    UPDATE public.manual_reservation_notifications
       SET mail_sent_at = COALESCE(mail_sent_at, now()),
           updated_at = now()
     WHERE id = _id
       AND (_lease_token IS NULL OR lease_token IS NOT DISTINCT FROM _lease_token)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$function$;

CREATE OR REPLACE FUNCTION public.fail_manual_notification(_id uuid, _error text, _retry_in_seconds integer DEFAULT 300, _lease_token uuid DEFAULT NULL)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH upd AS (
    UPDATE public.manual_reservation_notifications
       SET status = 'failed',
           last_error = left(COALESCE(_error, 'unbekannter Fehler'), 1000),
           lease_until = NULL,
           lease_token = NULL,
           next_retry_at = now() + make_interval(secs => GREATEST(COALESCE(_retry_in_seconds, 300), 0)),
           updated_at = now()
     WHERE id = _id
       AND status <> 'succeeded'
       AND (_lease_token IS NULL OR lease_token IS NOT DISTINCT FROM _lease_token)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$function$;

REVOKE ALL ON FUNCTION public.complete_manual_notification(uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_manual_notification(uuid, text, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_manual_notification_pushed(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_manual_notification_mailed(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_manual_notification(uuid, boolean, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_manual_notification(uuid, text, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_manual_notification_pushed(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_manual_notification_mailed(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.run_manual_notification_hook()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'public'
AS $function$
DECLARE
  v_token text;
  v_url text;
  v_base text;
BEGIN
  SELECT value INTO v_token FROM private.app_config WHERE key = 'notify_hook_token';
  SELECT value INTO v_url FROM private.app_config WHERE key = 'notify_hook_url';
  IF v_token IS NULL OR v_url IS NULL THEN
    RETURN;
  END IF;
  v_base := regexp_replace(v_url, '/api/public/hooks/.*$', '');
  PERFORM net.http_post(
    url := v_base || '/api/public/hooks/process-manual-notifications?token=' || v_token,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$function$;

DO $$
BEGIN
  PERFORM cron.unschedule('mt-process-manual-notifications');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'mt-process-manual-notifications',
  '*/15 * * * *',
  $$ SELECT private.run_manual_notification_hook(); $$
);