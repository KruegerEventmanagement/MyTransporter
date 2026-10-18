CREATE OR REPLACE FUNCTION public.finalize_deposit_review(
  _id uuid, _expected_revision integer, _admin uuid,
  _deposit integer, _total integer, _applied integer, _outstanding integer, _refund integer, _extra_km_applied integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.deposit_reviews; b record; has_km boolean;
BEGIN
  IF _deposit < 0 OR _total < 0 OR _applied < 0 OR _outstanding < 0 OR _refund < 0 OR _extra_km_applied < 0
     OR _refund > _deposit
     OR _applied <> _deposit - _refund
     OR _outstanding <> GREATEST(0, _total - _deposit)
     OR _extra_km_applied > _applied THEN
    RAISE EXCEPTION 'DEPOSIT_AMOUNTS_INCONSISTENT';
  END IF;
  SELECT * INTO r FROM public.deposit_reviews WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result','not_found'); END IF;
  IF r.status = 'finalized' THEN RETURN jsonb_build_object('result','already_finalized'); END IF;
  IF r.revision <> _expected_revision THEN RETURN jsonb_build_object('result','stale_revision'); END IF;
  has_km := r.items @> '[{"type":"extra_km"}]'::jsonb;
  IF NOT has_km AND _extra_km_applied <> 0 THEN RAISE EXCEPTION 'DEPOSIT_AMOUNTS_INCONSISTENT'; END IF;
  IF r.source_type = 'booking' THEN
    SELECT id, status, extra_charge_status INTO b FROM public.bookings WHERE id = r.source_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('result','not_found'); END IF;
    IF b.status = 'cancelled' OR EXISTS (SELECT 1 FROM public.deposit_settlements s WHERE s.booking_id = r.source_id
         AND s.kind IN ('cancellation','legacy') AND s.status NOT IN ('failed','canceled')) THEN
      RETURN jsonb_build_object('result','cancelled');
    END IF;
    IF has_km AND b.extra_charge_status IS NOT NULL AND b.extra_charge_status <> 'failed' THEN
      RETURN jsonb_build_object('result','extra_charged');
    END IF;
  ELSIF has_km THEN
    RAISE EXCEPTION 'DEPOSIT_AMOUNTS_INCONSISTENT';
  END IF;
  UPDATE public.deposit_reviews SET status = 'finalized', finalized_at = now(), finalized_by = _admin, updated_by = _admin,
    final_deposit_cents = _deposit, final_deduct_total_cents = _total, final_deduct_applied_cents = _applied,
    final_outstanding_cents = _outstanding, final_refund_cents = _refund, final_extra_km_applied_cents = _extra_km_applied,
    manual_payout_status = CASE WHEN r.source_type = 'manual' THEN (CASE WHEN _refund > 0 THEN 'open' ELSE 'not_required' END) ELSE NULL END
  WHERE id = _id;
  RETURN jsonb_build_object('result','finalized');
END $$;
REVOKE ALL ON FUNCTION public.finalize_deposit_review(uuid,integer,uuid,integer,integer,integer,integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_deposit_review(uuid,integer,uuid,integer,integer,integer,integer,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.deposit_reviews_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.source_type IS DISTINCT FROM OLD.source_type OR NEW.source_id IS DISTINCT FROM OLD.source_id THEN
    RAISE EXCEPTION 'DEPOSIT_REVIEW_IDENTITY_FROZEN';
  END IF;
  IF OLD.status = 'finalized' THEN
    IF NEW.status <> 'finalized' OR NEW.items IS DISTINCT FROM OLD.items OR NEW.revision <> OLD.revision
       OR NEW.customer_message IS DISTINCT FROM OLD.customer_message
       OR NEW.final_deposit_cents IS DISTINCT FROM OLD.final_deposit_cents
       OR NEW.final_deduct_total_cents IS DISTINCT FROM OLD.final_deduct_total_cents
       OR NEW.final_deduct_applied_cents IS DISTINCT FROM OLD.final_deduct_applied_cents
       OR NEW.final_outstanding_cents IS DISTINCT FROM OLD.final_outstanding_cents
       OR NEW.final_refund_cents IS DISTINCT FROM OLD.final_refund_cents
       OR NEW.manual_deposit_cents IS DISTINCT FROM OLD.manual_deposit_cents
       OR NEW.manual_deposit_method IS DISTINCT FROM OLD.manual_deposit_method
       OR NEW.refund_override_cents IS DISTINCT FROM OLD.refund_override_cents
       OR NEW.adjustment_reason IS DISTINCT FROM OLD.adjustment_reason
       OR NEW.send_closing_mail IS DISTINCT FROM OLD.send_closing_mail
       OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
       OR (OLD.settlement_id IS NOT NULL AND NEW.settlement_id IS DISTINCT FROM OLD.settlement_id)
       OR (OLD.manual_payout_status = 'confirmed' AND (NEW.manual_payout_status IS DISTINCT FROM OLD.manual_payout_status
            OR NEW.manual_payout_method IS DISTINCT FROM OLD.manual_payout_method
            OR NEW.manual_payout_confirmed_at IS DISTINCT FROM OLD.manual_payout_confirmed_at)) THEN
      RAISE EXCEPTION 'DEPOSIT_REVIEW_FINALIZED';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.claim_deposit_reminder(
  _source_type text, _source_id uuid, _end_version timestamptz, _title text, _body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; m record; base timestamptz; claimed uuid;
BEGIN
  IF _source_type NOT IN ('booking','manual') THEN RAISE EXCEPTION 'SOURCE_INVALID'; END IF;
  IF EXISTS (SELECT 1 FROM public.deposit_reviews r WHERE r.source_type = _source_type AND r.source_id = _source_id AND r.status = 'finalized') THEN
    RETURN jsonb_build_object('result','done');
  END IF;
  IF _source_type = 'booking' THEN
    SELECT id, status, deposit, deposit_status, return_reported_at,
           public.plan_end_at(public.local_start_at(start_date, start_hour), plan_id) AS planned_end
      INTO b FROM public.bookings WHERE id = _source_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('result','not_found'); END IF;
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
    base := m.end_at;
  END IF;
  IF base IS DISTINCT FROM _end_version THEN RETURN jsonb_build_object('result','stale'); END IF;
  UPDATE public.admin_notifications SET read = true
   WHERE type = 'deposit_reminder' AND read = false
     AND body LIKE '%[kaution:' || _source_type || ':' || _source_id || ']%';
  INSERT INTO public.deposit_reminders (source_type, source_id, end_version)
  VALUES (_source_type, _source_id, _end_version)
  ON CONFLICT (source_type, source_id, end_version) DO NOTHING
  RETURNING id INTO claimed;
  IF claimed IS NULL THEN RETURN jsonb_build_object('result','exists'); END IF;
  INSERT INTO public.admin_notifications (type, title, body, booking_id)
  VALUES ('deposit_reminder', _title, _body, CASE WHEN _source_type = 'booking' THEN _source_id ELSE NULL END);
  RETURN jsonb_build_object('result','created');
END $$;
REVOKE ALL ON FUNCTION public.claim_deposit_reminder(text, uuid, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_deposit_reminder(text, uuid, timestamptz, text, text) TO service_role;