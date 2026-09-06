-- Kennzeichen robust normalisieren (Leerzeichen/Bindestriche/Kleinschreibung)
CREATE OR REPLACE FUNCTION public.normalize_plate(_plate text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(regexp_replace(upper(coalesce(_plate, '')), '[^A-Z0-9]', '', 'g'), '')
$$;

-- Miet-Ende je Tarif (Spiegel von src/lib/booking-rules.ts)
CREATE OR REPLACE FUNCTION public.plan_end_at(_start timestamptz, _plan_id text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  p text := coalesce(_plan_id, '');
  hours numeric;
  weeks int;
BEGIN
  IF p = 'km' THEN
    RETURN ((date_trunc('day', _start AT TIME ZONE 'Europe/Berlin') + interval '22 hours') AT TIME ZONE 'Europe/Berlin');
  END IF;

  hours := CASE
    WHEN p = '3h' THEN 3
    WHEN p = '6h' THEN 6
    WHEN p IN ('24h', '24h_short', '24h_long', '24h_300', '24h_500', '24h_800') THEN 24
    WHEN p = 'multi_2d' THEN 48
    WHEN p = 'multi_3d' THEN 72
    WHEN p = 'multi_4d' THEN 96
    WHEN p = 'multi_5d' THEN 120
    WHEN p = 'multi_6d' THEN 144
    WHEN p = 'multi_7d' THEN 168
    ELSE NULL
  END;

  IF hours IS NULL AND p ~ '^week_x[0-9]+$' THEN
    weeks := greatest(1, (regexp_replace(p, '^week_x', ''))::int);
    hours := weeks * 168;
  END IF;

  -- Unbekannte Tarife konservativ als 24h behandeln
  RETURN _start + make_interval(hours => coalesce(hours, 24)::int);
END;
$$;

-- Startzeitpunkt aus Datum + Stunde in Europe/Berlin
CREATE OR REPLACE FUNCTION public.local_start_at(_start_date date, _start_hour int)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ((_start_date::timestamp + make_interval(hours => coalesce(_start_hour, 0))) AT TIME ZONE 'Europe/Berlin')
$$;

-- Alle Konflikte für ein Fahrzeug im Zeitraum [_start, _end)
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
    AND b.status IN ('paid', 'active', 'in_progress', 'picked_up', 'confirmed', 'started', 'running')
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

-- Bequeme Boolean-Prüfung
CREATE OR REPLACE FUNCTION public.is_vehicle_available(
  _plate text,
  _start timestamptz,
  _end timestamptz,
  _ignore_hold_user uuid DEFAULT NULL,
  _ignore_booking_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.vehicle_conflicts(_plate, _start, _end, _ignore_hold_user, _ignore_booking_id)
  )
$$;

-- Atomare Reservierung: Advisory Lock pro Fahrzeug schließt Race Conditions
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
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;
  e := public.plan_end_at(s, _plan_id);

  IF np IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(np, 0));
  END IF;

  DELETE FROM public.booking_holds WHERE expires_at < now();

  -- Eigene alten Holds für dieses Fahrzeug/Slot ersetzen
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
  RETURNING id, booking_holds.expires_at INTO hold_id, expires_at;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_plate(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.plan_end_at(timestamptz, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.local_start_at(date, int) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vehicle_conflicts(text, timestamptz, timestamptz, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_vehicle_available(text, timestamptz, timestamptz, uuid, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_hold_atomic(uuid, uuid, text, text, date, int, int) TO authenticated, service_role;