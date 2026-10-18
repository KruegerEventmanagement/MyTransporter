CREATE OR REPLACE FUNCTION public.claim_deposit_reminder(
  _source_type text, _source_id uuid, _end_version timestamptz, _title text, _body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; m record; rv record; base timestamptz; claimed uuid;
BEGIN
  IF _source_type NOT IN ('booking','manual') THEN RAISE EXCEPTION 'SOURCE_INVALID'; END IF;
  IF _source_type = 'booking' THEN
    SELECT id, status, deposit, deposit_status, return_reported_at,
           public.plan_end_at(public.local_start_at(start_date, start_hour), plan_id) AS planned_end
      INTO b FROM public.bookings WHERE id = _source_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('result','not_found'); END IF;
    -- Abschluss-Prüfung NACH dem Buchungslock: ein wartender paralleler Abschluss
    -- (finalize_deposit_review sperrt dieselbe Buchungszeile) kann sonst veralten.
    IF EXISTS (SELECT 1 FROM public.deposit_reviews r WHERE r.source_type = 'booking' AND r.source_id = _source_id AND r.status = 'finalized') THEN
      RETURN jsonb_build_object('result','done');
    END IF;
    IF b.status = 'cancelled' THEN RETURN jsonb_build_object('result','cancelled'); END IF;
    IF b.deposit_status = 'released' OR COALESCE(b.deposit, 0) <= 0 THEN RETURN jsonb_build_object('result','no_deposit'); END IF;
    IF EXISTS (SELECT 1 FROM public.deposit_settlements s WHERE s.booking_id = _source_id
         AND s.kind IN ('cancellation','legacy') AND s.status NOT IN ('failed','canceled')) THEN
      RETURN jsonb_build_object('result','done');
    END IF;
    base := GREATEST(b.planned_end, COALESCE(b.return_reported_at, '-infinity'::timestamptz));
  ELSE
    SELECT id, end_at INTO m FROM public.manual_reservations WHERE id = _source_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('result','not_found'); END IF;
    -- Manuelle Kaution: explizit 0 Euro oder 'keine Kaution' erinnert nicht;
    -- nur eine unbekannte (noch nicht erfasste) Kaution darf zur Prüfung erinnern.
    SELECT status, manual_deposit_cents, manual_deposit_method INTO rv
      FROM public.deposit_reviews WHERE source_type = 'manual' AND source_id = _source_id;
    IF rv.status = 'finalized' THEN RETURN jsonb_build_object('result','done'); END IF;
    IF rv.manual_deposit_method = 'none' OR rv.manual_deposit_cents = 0 THEN RETURN jsonb_build_object('result','no_deposit'); END IF;
    base := m.end_at;
  END IF;
  IF base IS DISTINCT FROM _end_version THEN RETURN jsonb_build_object('result','stale'); END IF;
  INSERT INTO public.deposit_reminders (source_type, source_id, end_version)
  VALUES (_source_type, _source_id, _end_version)
  ON CONFLICT (source_type, source_id, end_version) DO NOTHING
  RETURNING id INTO claimed;
  IF claimed IS NULL THEN RETURN jsonb_build_object('result','exists'); END IF;
  UPDATE public.admin_notifications SET read = true
   WHERE type = 'deposit_reminder' AND read = false
     AND body LIKE '%[kaution:' || _source_type || ':' || _source_id || ']%';
  INSERT INTO public.admin_notifications (type, title, body, booking_id)
  VALUES ('deposit_reminder', _title, _body, CASE WHEN _source_type = 'booking' THEN _source_id ELSE NULL END);
  RETURN jsonb_build_object('result','created');
END $$;
REVOKE ALL ON FUNCTION public.claim_deposit_reminder(text, uuid, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_deposit_reminder(text, uuid, timestamptz, text, text) TO service_role;