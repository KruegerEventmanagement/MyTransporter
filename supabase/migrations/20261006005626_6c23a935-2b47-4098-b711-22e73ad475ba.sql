-- Fix 22P02: text[] || unbekanntes Literal wurde als Array-Literal geparst. Nur Ausdrücke für Prüfvermerke geändert.
CREATE OR REPLACE FUNCTION public.report_trip_return(
  _booking_id uuid,
  _end_km integer,
  _end_km_manual boolean DEFAULT false,
  _end_fuel_percent integer DEFAULT NULL,
  _exceptions jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  b public.bookings;
  ex jsonb := '{}'::jsonb;
  k text;
  v text;
  have text[];
  required text[] := ARRAY['post_front','post_front_right','post_right','post_back_right','post_back',
                           'post_back_left','post_left','post_front_left','post_interior','post_odometer',
                           'post_fuel','tank_receipt'];
  covered text[] := ARRAY[]::text[];
  missing text[];
  driven integer;
  extra integer;
  charge integer;
  reasons text[] := ARRAY[]::text[];
  review text;
  code text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw bytea;
  i int;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nicht angemeldet.');
  END IF;
  IF _end_km IS NULL OR _end_km < 0 OR _end_km > 9999999 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ungültiger Kilometerstand.');
  END IF;
  IF _end_fuel_percent IS NOT NULL AND (_end_fuel_percent < 0 OR _end_fuel_percent > 100) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ungültiger Tankstand.');
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = _booking_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Buchung nicht gefunden.');
  END IF;

  IF b.status = ANY (public.trip_returning_statuses()) AND b.return_code IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'returnCode', b.return_code, 'alreadyReported', true,
                              'reviewReason', b.return_review_reason);
  END IF;
  IF NOT (b.status = ANY (public.trip_active_statuses())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Für diese Buchung ist keine Rückgabe möglich.');
  END IF;

  FOREACH k IN ARRAY ARRAY['photos','fuel','receipt'] LOOP
    v := left(btrim(COALESCE(_exceptions->>k, '')), 500);
    IF length(v) >= 10 THEN
      ex := ex || jsonb_build_object(k, v);
      covered := covered || CASE k
        WHEN 'photos' THEN ARRAY['post_front','post_front_right','post_right','post_back_right','post_back',
                                 'post_back_left','post_left','post_front_left','post_interior','post_odometer']
        WHEN 'fuel' THEN ARRAY['post_fuel']
        ELSE ARRAY['tank_receipt'] END;
    END IF;
  END LOOP;

  have := public.trip_confirmed_photo_types(_booking_id);
  SELECT COALESCE(array_agg(t ORDER BY ord), ARRAY[]::text[]) INTO missing
  FROM unnest(required) WITH ORDINALITY AS r(t, ord)
  WHERE NOT (t = ANY (have)) AND NOT (t = ANY (covered));
  IF cardinality(missing) > 0 THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Es fehlen bestätigte Nachweise. Bitte Fotos übertragen oder das Problem mit Grund angeben.',
      'missing', to_jsonb(missing));
  END IF;

  IF b.start_km IS NULL THEN
    reasons := array_append(reasons, 'Start-Kilometerstand fehlt – manuelle Prüfung.'::text);
  ELSIF _end_km < b.start_km THEN
    reasons := array_append(reasons, format('End-Kilometerstand %s ist kleiner als Start %s (z. B. Tacho-Anzeigefehler) – manuelle Prüfung, keine Berechnung.', _end_km, b.start_km)::text);
  ELSE
    driven := _end_km - b.start_km;
    extra := CASE WHEN b.plan_id = 'km' THEN driven ELSE GREATEST(0, driven - COALESCE(b.free_km, 0)) END;
    charge := extra * b.km_price_cents;
  END IF;
  IF ex ? 'photos' THEN reasons := array_append(reasons, ('Foto-/Kameraproblem: ' || (ex->>'photos'))::text); END IF;
  IF ex ? 'fuel' THEN reasons := array_append(reasons, ('Tankstand-Foto fehlt: ' || (ex->>'fuel'))::text); END IF;
  IF ex ? 'receipt' THEN reasons := array_append(reasons, ('Tankbeleg fehlt: ' || (ex->>'receipt'))::text); END IF;
  review := NULLIF(array_to_string(reasons, ' · '), '');

  raw := decode(md5(gen_random_uuid()::text), 'hex');
  code := '';
  FOR i IN 0..5 LOOP
    code := code || substr(alphabet, (get_byte(raw, i) % 32) + 1, 1);
  END LOOP;

  PERFORM set_config('mt.trip_return_rpc', 'on', true);
  UPDATE public.bookings SET
    status = 'returning',
    return_code = code,
    end_km = _end_km,
    end_km_manual = COALESCE(_end_km_manual, false),
    extra_km = extra,
    extra_km_charge_cents = charge,
    ai_end_fuel_percent = COALESCE(_end_fuel_percent, ai_end_fuel_percent),
    return_reported_at = now(),
    return_review_reason = review,
    return_exceptions = NULLIF(ex, '{}'::jsonb)
  WHERE id = _booking_id;
  PERFORM set_config('mt.trip_return_rpc', 'off', true);

  INSERT INTO public.admin_notifications (type, title, body, booking_id, user_id)
  VALUES ('trip_returning',
          CASE WHEN review IS NULL THEN 'Rückgabe steht an' ELSE 'Rückgabe gemeldet – Prüfung nötig' END,
          concat_ws(' · ', 'Rückgabecode ' || code,
                    CASE WHEN driven IS NOT NULL THEN driven || ' km gefahren' END,
                    CASE WHEN charge IS NOT NULL THEN 'Mehrkilometer ' || to_char(charge / 100.0, 'FM999990.00') || ' €' END,
                    CASE WHEN review IS NOT NULL THEN 'Prüfung: ' || review END),
          _booking_id, uid);

  RETURN jsonb_build_object('ok', true, 'returnCode', code, 'alreadyReported', false, 'reviewReason', review,
                            'extraKm', extra, 'chargeCents', charge);
END $$;

REVOKE ALL ON FUNCTION public.report_trip_return(uuid, integer, boolean, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_trip_return(uuid, integer, boolean, integer, jsonb) TO authenticated;