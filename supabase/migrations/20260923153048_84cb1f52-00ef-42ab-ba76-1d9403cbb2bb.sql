-- Kalender-Sync v2: ein Zustand je Quelle, Versionierung, Live-Snapshot, sichere Whitelist.
CREATE TABLE IF NOT EXISTS public.calendar_sync_state (
  source_type text NOT NULL CHECK (source_type IN ('booking','manual_reservation')),
  source_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  synced_version bigint NOT NULL DEFAULT 0,
  google_event_id text,
  adopted boolean NOT NULL DEFAULT false,
  last_action text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_retry_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  lease_version bigint,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_type, source_id)
);
GRANT SELECT ON public.calendar_sync_state TO authenticated;
GRANT ALL ON public.calendar_sync_state TO service_role;
ALTER TABLE public.calendar_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins lesen Kalenderstatus" ON public.calendar_sync_state
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER calendar_sync_state_set_updated_at BEFORE UPDATE ON public.calendar_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sichere Payloads (reine Whitelist, keine Codes/Notizen/Geburtsdaten/Dokumente/Kontaktdaten)
CREATE OR REPLACE FUNCTION public.booking_calendar_payload(_row bookings)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'booking_id', _row.id,
    'source_type', 'booking',
    'status', _row.status,
    'vehicle_name', _row.vehicle_name,
    'vehicle_plate', _row.vehicle_plate,
    'plan_label', _row.plan_label,
    'customer_name', NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    'start_at', to_char(public.local_start_at(_row.start_date, _row.start_hour) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'end_at', to_char(public.plan_end_at(public.local_start_at(_row.start_date, _row.start_hour), _row.plan_id) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'updated_at', to_char(_row.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
  FROM (SELECT 1) x LEFT JOIN public.profiles p ON p.id = _row.user_id
$$;

CREATE OR REPLACE FUNCTION public.manual_reservation_calendar_payload(_row manual_reservations)
 RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'reservation_id', _row.id,
    'source_type', 'manual_reservation',
    'revision', _row.revision,
    'vehicle_name', _row.vehicle_name,
    'vehicle_plate', _row.vehicle_plate,
    'customer_name', _row.customer_name,
    'start_at', to_char(_row.start_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'end_at', to_char(_row.end_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'updated_at', to_char(_row.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
$$;

-- Aktueller DB-Stand je Quelle (NULL = Quelle existiert nicht mehr)
CREATE OR REPLACE FUNCTION public.calendar_source_snapshot(_source_type text, _source_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE b public.bookings; m public.manual_reservations;
BEGIN
  IF _source_type = 'booking' THEN
    SELECT * INTO b FROM public.bookings WHERE id = _source_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN public.booking_calendar_payload(b);
  ELSIF _source_type = 'manual_reservation' THEN
    SELECT * INTO m FROM public.manual_reservations WHERE id = _source_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN public.manual_reservation_calendar_payload(m);
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.mark_calendar_source_dirty(_source_type text, _source_id uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  INSERT INTO public.calendar_sync_state (source_type, source_id)
  VALUES (_source_type, _source_id)
  ON CONFLICT (source_type, source_id) DO UPDATE
    SET version = calendar_sync_state.version + 1,
        status = 'pending', next_retry_at = NULL, updated_at = now();
$$;

-- Buchungen: nur bezahlte/aktive oder stornierte relevant; unbezahlte Checkouts nie.
CREATE OR REPLACE FUNCTION public.bookings_enqueue_calendar_sync()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE relevant boolean;
BEGIN
  relevant := NEW.status = ANY (public.blocking_booking_statuses())
           OR NEW.status IN ('cancelled','canceled');
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.start_date IS NOT DISTINCT FROM OLD.start_date
       AND NEW.start_hour IS NOT DISTINCT FROM OLD.start_hour
       AND NEW.plan_id IS NOT DISTINCT FROM OLD.plan_id
       AND NEW.vehicle_plate IS NOT DISTINCT FROM OLD.vehicle_plate
       AND NEW.vehicle_name IS NOT DISTINCT FROM OLD.vehicle_name THEN
      RETURN NEW;
    END IF;
    relevant := relevant OR EXISTS (SELECT 1 FROM public.calendar_sync_state s
                  WHERE s.source_type='booking' AND s.source_id=NEW.id);
  END IF;
  IF relevant THEN PERFORM public.mark_calendar_source_dirty('booking', NEW.id); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.manual_reservations_enqueue_calendar_sync()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.mark_calendar_source_dirty('manual_reservation', OLD.id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.revision = OLD.revision THEN RETURN NEW; END IF;
  PERFORM public.mark_calendar_source_dirty('manual_reservation', NEW.id);
  RETURN NEW;
END $$;

-- Claim je Quelle (Lease). Optional quellen-spezifisch für den Direktversuch.
CREATE OR REPLACE FUNCTION public.claim_calendar_sources(_limit integer DEFAULT 10, _lease_seconds integer DEFAULT 120,
  _source_type text DEFAULT NULL, _source_id uuid DEFAULT NULL)
 RETURNS SETOF public.calendar_sync_state LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  UPDATE public.calendar_sync_state s
     SET status = 'processing', attempts = s.attempts + 1,
         lease_token = gen_random_uuid(),
         lease_until = now() + make_interval(secs => GREATEST(COALESCE(_lease_seconds,120),10)),
         lease_version = s.version
   WHERE (s.source_type, s.source_id) IN (
     SELECT c.source_type, c.source_id FROM public.calendar_sync_state c
      WHERE c.synced_version < c.version
        AND (c.lease_until IS NULL OR c.lease_until < now())
        AND (_source_id IS NOT NULL OR c.next_retry_at IS NULL OR c.next_retry_at <= now())
        AND (_source_type IS NULL OR c.source_type = _source_type)
        AND (_source_id IS NULL OR c.source_id = _source_id)
      ORDER BY c.updated_at
      LIMIT GREATEST(COALESCE(_limit,10),1)
      FOR UPDATE SKIP LOCKED)
  RETURNING s.*;
$$;

-- Abschluss nur mit gültiger Lease; neuere Version bleibt offen (kein Überholen).
CREATE OR REPLACE FUNCTION public.complete_calendar_source(_source_type text, _source_id uuid, _lease_token uuid,
  _google_event_id text, _clear_event boolean DEFAULT false, _adopted boolean DEFAULT false, _action text DEFAULT NULL)
 RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH upd AS (
    UPDATE public.calendar_sync_state
       SET synced_version = GREATEST(synced_version, lease_version),
           google_event_id = CASE WHEN _clear_event THEN NULL ELSE COALESCE(_google_event_id, google_event_id) END,
           adopted = adopted OR _adopted,
           last_action = _action,
           status = CASE WHEN version > lease_version THEN 'pending' ELSE 'succeeded' END,
           synced_at = now(), last_error = NULL, next_retry_at = NULL,
           lease_token = NULL, lease_until = NULL, lease_version = NULL
     WHERE source_type = _source_type AND source_id = _source_id
       AND lease_token = _lease_token AND lease_until > now()
    RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM upd);
$$;

-- Zuordnung bereits gefundener Termine sofort sichern (auch vor Abschluss).
CREATE OR REPLACE FUNCTION public.set_calendar_source_event(_source_type text, _source_id uuid, _lease_token uuid,
  _google_event_id text, _adopted boolean)
 RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH upd AS (
    UPDATE public.calendar_sync_state
       SET google_event_id = _google_event_id, adopted = adopted OR _adopted
     WHERE source_type = _source_type AND source_id = _source_id
       AND lease_token = _lease_token AND lease_until > now()
    RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM upd);
$$;

CREATE OR REPLACE FUNCTION public.fail_calendar_source(_source_type text, _source_id uuid, _lease_token uuid,
  _error text, _retry_in_seconds integer DEFAULT 300)
 RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH upd AS (
    UPDATE public.calendar_sync_state
       SET status = 'failed', last_error = left(COALESCE(_error,'unbekannter Fehler'),1000),
           next_retry_at = now() + make_interval(secs => GREATEST(COALESCE(_retry_in_seconds,300),0)),
           lease_token = NULL, lease_until = NULL, lease_version = NULL
     WHERE source_type = _source_type AND source_id = _source_id AND lease_token = _lease_token
    RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM upd);
$$;

REVOKE ALL ON FUNCTION public.calendar_source_snapshot(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_calendar_source_dirty(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_calendar_sources(integer, integer, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_calendar_source(text, uuid, uuid, text, boolean, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_calendar_source_event(text, uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_calendar_source(text, uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_calendar_payload(bookings) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_source_snapshot(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_calendar_sources(integer, integer, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_calendar_source(text, uuid, uuid, text, boolean, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_calendar_source_event(text, uuid, uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_calendar_source(text, uuid, uuid, text, integer) TO service_role;

-- Alte hash-basierte Warteschlange stilllegen (leer) und Payload-Funktionen entkoppeln
REVOKE ALL ON FUNCTION public.claim_calendar_sync_jobs(integer, integer) FROM service_role;
UPDATE public.calendar_sync_jobs SET payload = '{}'::jsonb, status = 'superseded' WHERE status <> 'succeeded' OR payload ? 'pickup_code';

-- Bekannte, vom Betreiber nachgetragene Zuordnung (nicht neu anlegen)
INSERT INTO public.calendar_sync_state (source_type, source_id, version, synced_version, google_event_id, adopted, status, last_action, synced_at)
VALUES ('booking', '9145b6dc-251d-4e28-99d3-173167f9c3ed', 1, 0, '7u46jn3lsk3efopalca3r7591c', true, 'pending', 'mapped', NULL)
ON CONFLICT (source_type, source_id) DO UPDATE SET google_event_id = EXCLUDED.google_event_id, adopted = true;

-- Neuen Kalender-Cron bis zur Verbindung + Veröffentlichung deaktivieren
SELECT cron.alter_job(jobid, active := false) FROM cron.job WHERE jobname = 'mt-process-calendar-sync';