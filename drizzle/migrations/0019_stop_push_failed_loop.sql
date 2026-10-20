CREATE OR REPLACE FUNCTION private.trigger_admin_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'public', 'extensions'
AS $function$
DECLARE
  v_token text;
  v_url text;
  v_payload jsonb;
BEGIN
  -- Push-Fehlereinträge dürfen nie selbst einen Push auslösen (sonst Endlosschleife).
  IF NEW.type = 'push_failed' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_token FROM private.app_config WHERE key = 'notify_hook_token';
  SELECT value INTO v_url FROM private.app_config WHERE key = 'notify_hook_url';

  IF v_token IS NULL OR v_url IS NULL THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'type', NEW.type,
    'title', NEW.title,
    'body', NEW.body,
    'booking_id', NEW.booking_id,
    'user_id', NEW.user_id,
    'notification_id', NEW.id
  );

  PERFORM net.http_post(
    url := v_url || '?token=' || v_token,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := v_payload,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;