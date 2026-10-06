-- Schutz laufender Mieten + serverseitige, idempotente Rückgabemeldung.
-- Additiv: keine Daten werden gelöscht oder geändert.

CREATE OR REPLACE FUNCTION public.trip_active_statuses()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY['active','started','running','in_progress','picked_up']::text[]
$$;

CREATE OR REPLACE FUNCTION public.trip_returning_statuses()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY['returning','return_pending']::text[]
$$;

-- Kunden dürfen an ihrer Buchung nur fachlich vorgesehene Felder ändern.
-- Service-Rolle (auth.uid() IS NULL), Admins und die Rückgabe-RPC bleiben frei.
CREATE OR REPLACE FUNCTION public.bookings_guard_customer_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL
     OR current_setting('mt.trip_return_rpc', true) = 'on'
     OR public.has_role(uid, 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.start_hour IS DISTINCT FROM OLD.start_hour
     OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.plan_label IS DISTINCT FROM OLD.plan_label
     OR NEW.plan_price IS DISTINCT FROM OLD.plan_price
     OR NEW.deposit IS DISTINCT FROM OLD.deposit
     OR NEW.deposit_status IS DISTINCT FROM OLD.deposit_status
     OR NEW.deposit_released_at IS DISTINCT FROM OLD.deposit_released_at
     OR NEW.deposit_released_by IS DISTINCT FROM OLD.deposit_released_by
     OR NEW.deposit_deducted_cents IS DISTINCT FROM OLD.deposit_deducted_cents
     OR NEW.deposit_refund_id IS DISTINCT FROM OLD.deposit_refund_id
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
     OR NEW.stripe_payment_method_id IS DISTINCT FROM OLD.stripe_payment_method_id
     OR NEW.extra_charge_intent_id IS DISTINCT FROM OLD.extra_charge_intent_id
     OR NEW.extra_charge_status IS DISTINCT FROM OLD.extra_charge_status
     OR NEW.extra_charge_cents IS DISTINCT FROM OLD.extra_charge_cents
     OR NEW.free_km IS DISTINCT FROM OLD.free_km
     OR NEW.km_price_cents IS DISTINCT FROM OLD.km_price_cents
     OR NEW.addons IS DISTINCT FROM OLD.addons
     OR NEW.addons_total_cents IS DISTINCT FROM OLD.addons_total_cents
     OR NEW.vehicle_name IS DISTINCT FROM OLD.vehicle_name
     OR NEW.vehicle_plate IS DISTINCT FROM OLD.vehicle_plate
     OR NEW.pickup_code IS DISTINCT FROM OLD.pickup_code
     OR NEW.return_code IS DISTINCT FROM OLD.return_code
     OR NEW.extra_km IS DISTINCT FROM OLD.extra_km
     OR NEW.extra_km_charge_cents IS DISTINCT FROM OLD.extra_km_charge_cents
     OR NEW.coupon_code IS DISTINCT FROM OLD.coupon_code
     OR NEW.discount_cents IS DISTINCT FROM OLD.discount_cents
     OR NEW.return_reported_at IS DISTINCT FROM OLD.return_reported_at
     OR NEW.return_review_reason IS DISTINCT FROM OLD.return_review_reason
     OR NEW.return_exceptions IS DISTINCT FROM OLD.return_exceptions
     OR NEW.return_reminder_10min_for IS DISTINCT FROM OLD.return_reminder_10min_for
     OR NEW.reminder_24h_sent_at IS DISTINCT FROM OLD.reminder_24h_sent_at
     OR NEW.reminder_30min_sent_at IS DISTINCT FROM OLD.reminder_30min_sent_at THEN
    RAISE EXCEPTION 'TRIP_FIELD_LOCKED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Status: einziger Kundenübergang ist die Abholung (bezahlt -> aktiv).
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status IN ('paid','confirmed') AND NEW.status = 'active') THEN
    RAISE EXCEPTION 'TRIP_STATUS_LOCKED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Start-Kilometer nur bei der Abholung.
  IF NEW.start_km IS DISTINCT FROM OLD.start_km
     AND OLD.status NOT IN ('paid','confirmed') THEN
    RAISE EXCEPTION 'TRIP_FIELD_LOCKED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Rückgabe-Entwurfswerte nur während der laufenden Miete.
  IF (NEW.end_km IS DISTINCT FROM OLD.end_km
      OR NEW.end_km_manual IS DISTINCT FROM OLD.end_km_manual
      OR NEW.ai_end_fuel_percent IS DISTINCT FROM OLD.ai_end_fuel_percent
      OR NEW.tank_level_end IS DISTINCT FROM OLD.tank_level_end)
     AND NOT (OLD.status = ANY (public.trip_active_statuses())) THEN
    RAISE EXCEPTION 'TRIP_FIELD_LOCKED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_guard_customer_update_trigger ON public.bookings;
CREATE TRIGGER bookings_guard_customer_update_trigger
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_guard_customer_update();

-- Bestätigte Rückgabefotos: Zeile + echtes, nicht leeres Bildobjekt im eigenen Buchungsordner.
CREATE OR REPLACE FUNCTION public.trip_confirmed_photo_types(_booking_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT tp.photo_type), ARRAY[]::text[])
  FROM public.trip_photos tp
  JOIN storage.objects o
    ON o.bucket_id = 'trip-photos' AND o.name = tp.photo_url
  WHERE tp.booking_id = _booking_id
    AND tp.photo_url LIKE _booking_id::text || '/%'
    AND position('..' in tp.photo_url) = 0
    AND COALESCE((o.metadata->>'size')::bigint, 0) > 0
    AND COALESCE(o.metadata->>'mimetype', '') LIKE 'image/%'
$$;

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
  -- v2 (geführter Foto-Wizard): 4 Seiten + Innenraum + EIN Instrumentenfoto (Kilometer+Tank),
  -- plus IMMER Tankbeleg (7 Pflichtnachweise). Ohne flow=v2 gilt unverändert die Altliste.
  v2 boolean := COALESCE(_exceptions->>'flow', '') = 'v2';
  refueled boolean := COALESCE(_exceptions->>'refueled', '') = 'true';
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

  IF v2 THEN
    required := ARRAY['post_front','post_back','post_left','post_right','post_interior','post_dashboard'];
    required := array_append(required, 'tank_receipt'::text);
  END IF;

  FOREACH k IN ARRAY ARRAY['photos','fuel','receipt'] LOOP
    v := left(btrim(COALESCE(_exceptions->>k, '')), 500);
    IF length(v) >= 10 THEN
      ex := ex || jsonb_build_object(k, v);
      covered := covered || CASE
        WHEN v2 AND k = 'photos' THEN ARRAY['post_front','post_back','post_left','post_right','post_interior']
        WHEN v2 AND k = 'fuel' THEN ARRAY['post_dashboard']
        WHEN k = 'photos' THEN ARRAY['post_front','post_front_right','post_right','post_back_right','post_back',
                                 'post_back_left','post_left','post_front_left','post_interior','post_odometer']
        WHEN k = 'fuel' THEN ARRAY['post_fuel']
        ELSE ARRAY['tank_receipt'] END;
    END IF;
  END LOOP;

  have := public.trip_confirmed_photo_types(_booking_id);
  -- Kompatibilität: bereits bestätigte getrennte Tacho- + Tankfotos zählen als Instrumentenfoto.
  IF v2 AND 'post_odometer' = ANY (have) AND 'post_fuel' = ANY (have) THEN
    have := array_append(have, 'post_dashboard'::text);
  END IF;
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
  IF ex ? 'fuel' THEN reasons := array_append(reasons, (CASE WHEN v2 THEN 'Instrumentenfoto (Kilometer+Tank) fehlt: ' ELSE 'Tankstand-Foto fehlt: ' END || (ex->>'fuel'))::text); END IF;
  IF ex ? 'receipt' THEN reasons := array_append(reasons, ('Tankbeleg fehlt: ' || (ex->>'receipt'))::text); END IF;
  review := NULLIF(array_to_string(reasons, ' · '), '');
  IF v2 THEN ex := ex || jsonb_build_object('flow', 'v2', 'refueled', refueled); END IF;

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
REVOKE ALL ON FUNCTION public.trip_confirmed_photo_types(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bookings_guard_customer_update() FROM PUBLIC, anon, authenticated;
