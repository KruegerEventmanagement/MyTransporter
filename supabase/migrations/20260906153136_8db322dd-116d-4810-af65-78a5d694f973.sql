-- 1) Zentrale Liste der sperrenden Buchungsstatus (inkl. 'returning')
CREATE OR REPLACE FUNCTION public.blocking_booking_statuses()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'paid', 'confirmed', 'active', 'started', 'running',
    'in_progress', 'picked_up', 'returning', 'return_pending'
  ]::text[]
$$;

REVOKE ALL ON FUNCTION public.blocking_booking_statuses() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.blocking_booking_statuses() TO service_role;

-- 2) vehicle_conflicts nutzt die zentrale Liste
CREATE OR REPLACE FUNCTION public.vehicle_conflicts(
  _plate text,
  _start timestamptz,
  _end timestamptz,
  _ignore_hold_user uuid DEFAULT NULL,
  _ignore_booking_id uuid DEFAULT NULL
)
RETURNS TABLE(source text, ref_id uuid, start_at timestamptz, end_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH np AS (SELECT public.normalize_plate(_plate) AS p)
  SELECT 'booking'::text, b.id,
         public.local_start_at(b.start_date, b.start_hour),
         public.plan_end_at(public.local_start_at(b.start_date, b.start_hour), b.plan_id)
  FROM public.bookings b, np
  WHERE np.p IS NOT NULL
    AND public.normalize_plate(b.vehicle_plate) = np.p
    AND b.status = ANY (public.blocking_booking_statuses())
    AND (_ignore_booking_id IS NULL OR b.id <> _ignore_booking_id)
    AND _start < public.plan_end_at(public.local_start_at(b.start_date, b.start_hour), b.plan_id)
    AND _end > public.local_start_at(b.start_date, b.start_hour)

  UNION ALL
  SELECT 'hold'::text, h.id,
         public.local_start_at(h.start_date, h.start_hour),
         public.plan_end_at(public.local_start_at(h.start_date, h.start_hour), h.plan_id)
  FROM public.booking_holds h, np
  WHERE np.p IS NOT NULL
    AND public.normalize_plate(h.vehicle_plate) = np.p
    AND h.expires_at > now()
    AND (_ignore_hold_user IS NULL OR h.user_id <> _ignore_hold_user)
    AND _start < public.plan_end_at(public.local_start_at(h.start_date, h.start_hour), h.plan_id)
    AND _end > public.local_start_at(h.start_date, h.start_hour)

  UNION ALL
  SELECT 'block'::text, vb.id, vb.start_at, vb.end_at
  FROM public.vehicle_blocks vb, np
  WHERE np.p IS NOT NULL
    AND public.normalize_plate(vb.vehicle_plate) = np.p
    AND _start < vb.end_at AND _end > vb.start_at

  UNION ALL
  SELECT 'manual'::text, mr.id, mr.start_at, mr.end_at
  FROM public.manual_reservations mr, np
  WHERE np.p IS NOT NULL
    AND public.normalize_plate(mr.vehicle_plate) = np.p
    AND _start < mr.end_at AND _end > mr.start_at
$$;

-- 3) Letzte Schranke: BEFORE INSERT auf bookings, atomar mit Advisory Lock
CREATE OR REPLACE FUNCTION public.bookings_enforce_vehicle_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  np text := public.normalize_plate(NEW.vehicle_plate);
  s timestamptz;
  e timestamptz;
  conflict record;
  own_hold boolean := false;
BEGIN
  -- Nicht-sperrende Status (cancelled, completed, refunded, …) dürfen frei angelegt werden
  IF NEW.status IS NULL OR NOT (NEW.status = ANY (public.blocking_booking_statuses())) THEN
    RETURN NEW;
  END IF;
  IF np IS NULL OR NEW.start_date IS NULL OR NEW.start_hour IS NULL THEN
    RETURN NEW;
  END IF;

  s := public.local_start_at(NEW.start_date, NEW.start_hour);
  e := public.plan_end_at(s, NEW.plan_id);

  -- Gleicher Lock-Schlüssel wie in create_booking_hold_atomic
  PERFORM pg_advisory_xact_lock(hashtextextended(np, 0));

  -- Eigener, noch gültiger Hold für exakt dieses Fahrzeug/Tarif/Datum/Stunde?
  SELECT EXISTS (
    SELECT 1 FROM public.booking_holds h
    WHERE h.user_id = NEW.user_id
      AND public.normalize_plate(h.vehicle_plate) = np
      AND h.plan_id = NEW.plan_id
      AND h.start_date = NEW.start_date
      AND h.start_hour = NEW.start_hour
      AND h.expires_at > now()
  ) INTO own_hold;

  SELECT * INTO conflict
  FROM public.vehicle_conflicts(
    NEW.vehicle_plate, s, e,
    CASE WHEN own_hold THEN NEW.user_id ELSE NULL END,
    NEW.id
  )
  LIMIT 1;

  IF conflict IS NOT NULL THEN
    RAISE EXCEPTION 'VEHICLE_UNAVAILABLE: % belegt (%) von % bis %',
      NEW.vehicle_plate,
      conflict.source,
      to_char(conflict.start_at AT TIME ZONE 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'),
      to_char(conflict.end_at AT TIME ZONE 'Europe/Berlin', 'DD.MM.YYYY HH24:MI')
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_enforce_vehicle_availability_trigger ON public.bookings;
CREATE TRIGGER bookings_enforce_vehicle_availability_trigger
BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_enforce_vehicle_availability();