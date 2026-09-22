-- 1) Revision auf manuellen Terminen
ALTER TABLE public.manual_reservations
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;

-- 2) Outbox-Tabelle
CREATE TABLE IF NOT EXISTS public.manual_reservation_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('created', 'updated', 'deleted')),
  revision integer NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  lease_until timestamptz,
  next_retry_at timestamptz,
  push_sent_at timestamptz,
  succeeded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, event_kind, revision)
);

CREATE INDEX IF NOT EXISTS manual_reservation_notifications_pending_idx
  ON public.manual_reservation_notifications (status, next_retry_at);
CREATE INDEX IF NOT EXISTS manual_reservation_notifications_reservation_idx
  ON public.manual_reservation_notifications (reservation_id, created_at DESC);

GRANT SELECT ON public.manual_reservation_notifications TO authenticated;
GRANT ALL ON public.manual_reservation_notifications TO service_role;

ALTER TABLE public.manual_reservation_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read manual reservation notifications"
  ON public.manual_reservation_notifications;
CREATE POLICY "Admins can read manual reservation notifications"
  ON public.manual_reservation_notifications
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS manual_reservation_notifications_set_updated_at
  ON public.manual_reservation_notifications;
CREATE TRIGGER manual_reservation_notifications_set_updated_at
  BEFORE UPDATE ON public.manual_reservation_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Sicherer Datenauszug (niemals Ausweis/Führerschein/Geburtsdatum/Dokumente)
CREATE OR REPLACE FUNCTION public.manual_reservation_notification_payload(_row public.manual_reservations)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
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
    'note', _row.note,
    'created_at', to_char(_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'updated_at', to_char(_row.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
$$;

-- 4) Revision nur bei echten inhaltlichen Änderungen hochzählen
CREATE OR REPLACE FUNCTION public.manual_reservations_bump_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  ignored text[] := ARRAY['updated_at', 'revision', 'reminder_24h_sent_at', 'reminder_30min_sent_at'];
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
$$;

DROP TRIGGER IF EXISTS manual_reservations_bump_revision_trigger ON public.manual_reservations;
CREATE TRIGGER manual_reservations_bump_revision_trigger
  BEFORE UPDATE ON public.manual_reservations
  FOR EACH ROW EXECUTE FUNCTION public.manual_reservations_bump_revision();

-- 5) Atomare Einreihung in dieselbe Transaktion wie die Datenänderung
CREATE OR REPLACE FUNCTION public.manual_reservations_enqueue_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  kind text;
  row_rec public.manual_reservations;
BEGIN
  IF TG_OP = 'INSERT' THEN
    kind := 'created';
    row_rec := NEW;
  ELSIF TG_OP = 'DELETE' THEN
    kind := 'deleted';
    row_rec := OLD;
  ELSE
    IF NEW.revision = OLD.revision THEN
      RETURN NEW;
    END IF;
    kind := 'updated';
    row_rec := NEW;
  END IF;

  INSERT INTO public.manual_reservation_notifications
    (reservation_id, event_kind, revision, payload)
  VALUES
    (row_rec.id, kind, row_rec.revision,
     public.manual_reservation_notification_payload(row_rec)
       || jsonb_build_object('event_kind', kind))
  ON CONFLICT (reservation_id, event_kind, revision) DO NOTHING;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS manual_reservations_enqueue_notification_trigger ON public.manual_reservations;
CREATE TRIGGER manual_reservations_enqueue_notification_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.manual_reservations
  FOR EACH ROW EXECUTE FUNCTION public.manual_reservations_enqueue_notification();

-- 6) Parallel-sicheres Abholen / Abschließen / Fehlschlagen
CREATE OR REPLACE FUNCTION public.claim_manual_notifications(
  _limit integer DEFAULT 10,
  _lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.manual_reservation_notifications
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.manual_reservation_notifications n
     SET status = 'pending',
         attempts = n.attempts + 1,
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
$$;

CREATE OR REPLACE FUNCTION public.complete_manual_notification(
  _id uuid,
  _push_sent boolean DEFAULT false
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.manual_reservation_notifications
     SET status = 'succeeded',
         succeeded_at = COALESCE(succeeded_at, now()),
         lease_until = NULL,
         next_retry_at = NULL,
         last_error = NULL,
         push_sent_at = CASE WHEN _push_sent THEN COALESCE(push_sent_at, now()) ELSE push_sent_at END,
         updated_at = now()
   WHERE id = _id;
$$;

CREATE OR REPLACE FUNCTION public.mark_manual_notification_pushed(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.manual_reservation_notifications
     SET push_sent_at = COALESCE(push_sent_at, now()),
         updated_at = now()
   WHERE id = _id;
$$;

CREATE OR REPLACE FUNCTION public.fail_manual_notification(
  _id uuid,
  _error text,
  _retry_in_seconds integer DEFAULT 300
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.manual_reservation_notifications
     SET status = 'failed',
         last_error = left(COALESCE(_error, 'unbekannter Fehler'), 1000),
         lease_until = NULL,
         next_retry_at = now() + make_interval(secs => GREATEST(COALESCE(_retry_in_seconds, 300), 0)),
         updated_at = now()
   WHERE id = _id
     AND status <> 'succeeded';
$$;

REVOKE ALL ON FUNCTION public.claim_manual_notifications(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_manual_notification(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_manual_notification_pushed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_manual_notification(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_manual_notifications(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_manual_notification(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_manual_notification_pushed(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_manual_notification(uuid, text, integer) TO service_role;