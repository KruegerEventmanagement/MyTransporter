-- Dauerhafte Warteschlange für die Kalenderübertragung (Buchungen + manuelle Termine)
CREATE TABLE IF NOT EXISTS public.calendar_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('booking', 'manual_reservation')),
  source_id uuid NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('upsert', 'delete')),
  content_hash text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_retry_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  google_event_id text,
  succeeded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_sync_jobs_uniq UNIQUE (source_type, source_id, event_kind, content_hash)
);

CREATE INDEX IF NOT EXISTS calendar_sync_jobs_open_idx
  ON public.calendar_sync_jobs (created_at)
  WHERE status <> 'succeeded';

GRANT ALL ON public.calendar_sync_jobs TO service_role;
ALTER TABLE public.calendar_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view calendar sync jobs" ON public.calendar_sync_jobs;
CREATE POLICY "Admins can view calendar sync jobs"
  ON public.calendar_sync_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.calendar_sync_jobs TO authenticated;

DROP TRIGGER IF EXISTS calendar_sync_jobs_set_updated_at ON public.calendar_sync_jobs;
CREATE TRIGGER calendar_sync_jobs_set_updated_at
  BEFORE UPDATE ON public.calendar_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sicherer Kalender-Snapshot einer Buchung (keine Ausweis-/Geburts-/Freitextdaten)
CREATE OR REPLACE FUNCTION public.booking_calendar_payload(_row public.bookings)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'booking_id', _row.id,
    'source_type', 'booking',
    'status', _row.status,
    'vehicle_name', _row.vehicle_name,
    'vehicle_plate', _row.vehicle_plate,
    'plan_label', _row.plan_label,
    'pickup_code', _row.pickup_code,
    'start_at', to_char(public.local_start_at(_row.start_date, _row.start_hour) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'end_at', to_char(public.plan_end_at(public.local_start_at(_row.start_date, _row.start_hour), _row.plan_id) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
$$;

CREATE OR REPLACE FUNCTION public.enqueue_calendar_sync(
  _source_type text, _source_id uuid, _event_kind text, _payload jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.calendar_sync_jobs (source_type, source_id, event_kind, content_hash, payload)
  VALUES (_source_type, _source_id, _event_kind, md5(_payload::text), _payload)
  ON CONFLICT (source_type, source_id, event_kind, content_hash) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.bookings_enqueue_calendar_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  blocking boolean := NEW.status = ANY (public.blocking_booking_statuses());
  p jsonb := public.booking_calendar_payload(NEW);
BEGIN
  IF blocking THEN
    PERFORM public.enqueue_calendar_sync('booking', NEW.id, 'upsert', p);
  ELSE
    -- Storno/Erstattung/Abschluss: Termin im Kalender entfernen
    PERFORM public.enqueue_calendar_sync('booking', NEW.id, 'delete',
      jsonb_build_object('booking_id', NEW.id, 'source_type', 'booking', 'status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_enqueue_calendar_sync_trigger ON public.bookings;
CREATE TRIGGER bookings_enqueue_calendar_sync_trigger
  AFTER INSERT OR UPDATE OF status, start_date, start_hour, plan_id, plan_label, vehicle_plate, vehicle_name
  ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_enqueue_calendar_sync();

CREATE OR REPLACE FUNCTION public.manual_reservations_enqueue_calendar_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_calendar_sync('manual_reservation', OLD.id, 'delete',
      jsonb_build_object('reservation_id', OLD.id, 'source_type', 'manual_reservation',
                         'revision', OLD.revision));
    RETURN OLD;
  END IF;
  PERFORM public.enqueue_calendar_sync('manual_reservation', NEW.id, 'upsert',
    public.manual_reservation_notification_payload(NEW));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS manual_reservations_enqueue_calendar_sync_trigger ON public.manual_reservations;
CREATE TRIGGER manual_reservations_enqueue_calendar_sync_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.manual_reservations
  FOR EACH ROW EXECUTE FUNCTION public.manual_reservations_enqueue_calendar_sync();

-- Parallel-sicheres Claimen mit Lease
CREATE OR REPLACE FUNCTION public.claim_calendar_sync_jobs(
  _limit integer DEFAULT 10, _lease_seconds integer DEFAULT 120
) RETURNS SETOF public.calendar_sync_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.calendar_sync_jobs j
     SET status = 'processing',
         attempts = j.attempts + 1,
         lease_token = gen_random_uuid(),
         lease_until = now() + make_interval(secs => GREATEST(COALESCE(_lease_seconds, 120), 10)),
         updated_at = now()
   WHERE j.id IN (
     SELECT c.id FROM public.calendar_sync_jobs c
      WHERE c.status <> 'succeeded'
        AND (c.next_retry_at IS NULL OR c.next_retry_at <= now())
        AND (c.lease_until IS NULL OR c.lease_until < now())
      ORDER BY c.created_at
      LIMIT GREATEST(COALESCE(_limit, 10), 1)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING j.*;
$$;

CREATE OR REPLACE FUNCTION public.complete_calendar_sync_job(
  _id uuid, _google_event_id text DEFAULT NULL, _lease_token uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH upd AS (
    UPDATE public.calendar_sync_jobs
       SET status = 'succeeded',
           succeeded_at = COALESCE(succeeded_at, now()),
           google_event_id = COALESCE(_google_event_id, google_event_id),
           lease_until = NULL, lease_token = NULL,
           next_retry_at = NULL, last_error = NULL, updated_at = now()
     WHERE id = _id
       AND (_lease_token IS NULL OR lease_token IS NOT DISTINCT FROM _lease_token)
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM upd);
$$;

CREATE OR REPLACE FUNCTION public.fail_calendar_sync_job(
  _id uuid, _error text, _retry_in_seconds integer DEFAULT 300, _lease_token uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH upd AS (
    UPDATE public.calendar_sync_jobs
       SET status = 'failed',
           last_error = left(COALESCE(_error, 'unbekannter Fehler'), 1000),
           lease_until = NULL, lease_token = NULL,
           next_retry_at = now() + make_interval(secs => GREATEST(COALESCE(_retry_in_seconds, 300), 0)),
           updated_at = now()
     WHERE id = _id
       AND status <> 'succeeded'
       AND (_lease_token IS NULL OR lease_token IS NOT DISTINCT FROM _lease_token)
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM upd);
$$;