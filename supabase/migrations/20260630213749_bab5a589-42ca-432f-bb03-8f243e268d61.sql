
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_config (
  key text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO private.app_config(key, value)
VALUES ('notify_hook_token', 'mt_notify_7f3a9b2e8c1d4e6f5a8b9c0d2e3f4a5b6c7d8e9f0a1b2c3d'),
       ('notify_hook_url', 'https://mytransporter.lovable.app/api/public/hooks/notify-admin')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION private.trigger_admin_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, extensions
AS $$
DECLARE
  v_token text;
  v_url text;
  v_payload jsonb;
BEGIN
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
  -- Niemals den Insert blocken
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_notifications_push_trigger ON public.admin_notifications;
CREATE TRIGGER admin_notifications_push_trigger
AFTER INSERT ON public.admin_notifications
FOR EACH ROW
EXECUTE FUNCTION private.trigger_admin_push();
