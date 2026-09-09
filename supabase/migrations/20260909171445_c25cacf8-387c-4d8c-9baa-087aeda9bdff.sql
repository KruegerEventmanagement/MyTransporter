-- 1) Action-/Outbox-Tabelle für Folgeaktionen nach bezahlten Buchungen
CREATE TABLE IF NOT EXISTS public.booking_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  action_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  locked_at timestamptz,
  next_retry_at timestamptz,
  succeeded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_actions_status_chk
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  CONSTRAINT booking_actions_key_chk
    CHECK (action_key IN ('new_booking_notification', 'customer_confirmation_invoice', 'admin_booking_email', 'admin_push'))
);

GRANT SELECT ON public.booking_actions TO authenticated;
GRANT ALL ON public.booking_actions TO service_role;

ALTER TABLE public.booking_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view booking actions" ON public.booking_actions;
CREATE POLICY "Admins can view booking actions"
  ON public.booking_actions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE UNIQUE INDEX IF NOT EXISTS booking_actions_booking_action_uniq
  ON public.booking_actions (booking_id, action_key);

CREATE INDEX IF NOT EXISTS booking_actions_status_idx
  ON public.booking_actions (status, next_retry_at);

DROP TRIGGER IF EXISTS booking_actions_set_updated_at ON public.booking_actions;
CREATE TRIGGER booking_actions_set_updated_at
  BEFORE UPDATE ON public.booking_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Atomares Claiming: genau ein paralleler Lauf gewinnt pro Aktion
CREATE OR REPLACE FUNCTION public.claim_booking_action(
  _booking_id uuid,
  _action_key text,
  _lock_timeout_seconds integer DEFAULT 300
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claimed uuid;
BEGIN
  INSERT INTO public.booking_actions (booking_id, action_key, status)
  VALUES (_booking_id, _action_key, 'pending')
  ON CONFLICT (booking_id, action_key) DO NOTHING;

  UPDATE public.booking_actions
     SET status = 'processing',
         locked_at = now(),
         attempts = attempts + 1,
         updated_at = now()
   WHERE booking_id = _booking_id
     AND action_key = _action_key
     AND status <> 'succeeded'
     AND (next_retry_at IS NULL OR next_retry_at <= now())
     AND (
           status IN ('pending', 'failed')
           OR (status = 'processing'
               AND (locked_at IS NULL
                    OR locked_at < now() - make_interval(secs => _lock_timeout_seconds)))
         )
  RETURNING id INTO _claimed;

  RETURN _claimed IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_booking_action(
  _booking_id uuid,
  _action_key text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.booking_actions
     SET status = 'succeeded',
         succeeded_at = COALESCE(succeeded_at, now()),
         locked_at = NULL,
         next_retry_at = NULL,
         last_error = NULL,
         updated_at = now()
   WHERE booking_id = _booking_id
     AND action_key = _action_key;
$$;

CREATE OR REPLACE FUNCTION public.fail_booking_action(
  _booking_id uuid,
  _action_key text,
  _error text,
  _retry_in_seconds integer DEFAULT 60
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.booking_actions
     SET status = 'failed',
         last_error = left(COALESCE(_error, 'unbekannter Fehler'), 1000),
         locked_at = NULL,
         next_retry_at = now() + make_interval(secs => GREATEST(_retry_in_seconds, 0)),
         updated_at = now()
   WHERE booking_id = _booking_id
     AND action_key = _action_key
     AND status <> 'succeeded';
$$;

REVOKE ALL ON FUNCTION public.claim_booking_action(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_booking_action(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_booking_action(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_booking_action(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_booking_action(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_booking_action(uuid, text, text, integer) TO service_role;

-- 3) Titel-Schreibweise normalisieren (nur wo keine Umlaut-Zeile existiert)
UPDATE public.admin_notifications a
   SET title = 'Buchungsbestätigung versendet'
 WHERE a.title = 'Buchungsbestaetigung versendet'
   AND NOT EXISTS (
     SELECT 1 FROM public.admin_notifications b
      WHERE b.booking_id IS NOT DISTINCT FROM a.booking_id
        AND b.title = 'Buchungsbestätigung versendet'
   );

-- 4) Unique-Index auf die korrekte Umlaut-Schreibweise umstellen
-- Hinweis: es existieren historische Doppelzeilen (23.06.2026) aus der Zeit vor
-- dem Index. Diese bleiben unangetastet; der Index schützt ab jetzt.
DROP INDEX IF EXISTS public.admin_notifications_booking_action_uniq;
CREATE UNIQUE INDEX admin_notifications_booking_action_uniq
  ON public.admin_notifications (booking_id, title)
  WHERE booking_id IS NOT NULL
    AND created_at >= '2026-07-01'
    AND title IN ('Neue Buchung', 'Buchungsbestätigung versendet', 'Buchungsbestaetigung versendet', 'Admin-Buchungsmail versendet');