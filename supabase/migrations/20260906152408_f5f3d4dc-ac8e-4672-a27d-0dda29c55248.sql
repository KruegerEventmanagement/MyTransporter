CREATE OR REPLACE FUNCTION public.create_booking_hold_atomic(
  _user_id uuid,
  _vehicle_id uuid,
  _vehicle_plate text,
  _plan_id text,
  _start_date date,
  _start_hour int,
  _minutes int DEFAULT 15
)
RETURNS TABLE(hold_id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  np text := public.normalize_plate(_vehicle_plate);
  s timestamptz := public.local_start_at(_start_date, _start_hour);
  e timestamptz;
  conflict record;
  new_expires timestamptz := now() + make_interval(mins => greatest(1, coalesce(_minutes, 15)));
  new_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;
  e := public.plan_end_at(s, _plan_id);

  IF np IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(np, 0));
  END IF;

  DELETE FROM public.booking_holds h WHERE h.expires_at < now();

  -- Eigene alte Holds für dieses Fahrzeug ersetzen
  DELETE FROM public.booking_holds h
  WHERE h.user_id = _user_id
    AND (np IS NULL OR public.normalize_plate(h.vehicle_plate) = np);

  IF np IS NOT NULL THEN
    SELECT * INTO conflict
    FROM public.vehicle_conflicts(_vehicle_plate, s, e, _user_id, NULL)
    LIMIT 1;
    IF conflict IS NOT NULL THEN
      RAISE EXCEPTION 'VEHICLE_UNAVAILABLE: % belegt von % bis %',
        _vehicle_plate,
        to_char(conflict.start_at AT TIME ZONE 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'),
        to_char(conflict.end_at AT TIME ZONE 'Europe/Berlin', 'DD.MM.YYYY HH24:MI');
    END IF;
  END IF;

  INSERT INTO public.booking_holds (user_id, vehicle_id, vehicle_plate, plan_id, start_date, start_hour, expires_at)
  VALUES (_user_id, _vehicle_id, _vehicle_plate, _plan_id, _start_date, _start_hour, new_expires)
  RETURNING id INTO new_id;

  hold_id := new_id;
  expires_at := new_expires;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking_hold_atomic(uuid, uuid, text, text, date, int, int) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.create_booking_hold_atomic(uuid, uuid, text, text, date, int, int) TO service_role;