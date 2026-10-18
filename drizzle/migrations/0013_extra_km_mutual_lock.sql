ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS extra_charge_claimed_at timestamptz;
ALTER TABLE public.deposit_reviews ADD COLUMN IF NOT EXISTS final_extra_km_applied_cents integer;

-- Separater Karteneinzug Mehrkilometer: atomarer Claim am Buchungsdatensatz.
-- Betrag wird beim ersten Claim eingefroren; Wiederholung nutzt denselben Betrag/Key.
CREATE OR REPLACE FUNCTION public.claim_extra_charge(_booking_id uuid, _amount_cents integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
BEGIN
  SELECT id, extra_charge_status, extra_charge_cents, extra_charge_intent_id, extra_charge_claimed_at, extra_km_charge_cents
    INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result','not_found'); END IF;
  IF EXISTS (SELECT 1 FROM public.deposit_reviews r WHERE r.source_type = 'booking' AND r.source_id = _booking_id
             AND r.items @> '[{"type":"extra_km"}]'::jsonb) THEN
    RETURN jsonb_build_object('result','in_deposit_review');
  END IF;
  IF b.extra_charge_status = 'succeeded' THEN RETURN jsonb_build_object('result','succeeded'); END IF;
  IF b.extra_charge_status IS NOT NULL AND b.extra_charge_status NOT IN ('failed') THEN
    -- laufend/unklar: nur derselbe eingefrorene Betrag innerhalb des Idempotenzfensters
    IF b.extra_charge_claimed_at IS NULL OR b.extra_charge_claimed_at < now() - interval '23 hours' THEN
      RETURN jsonb_build_object('result','needs_review');
    END IF;
    RETURN jsonb_build_object('result','resume','amount_cents',b.extra_charge_cents,'claimed_at',b.extra_charge_claimed_at);
  END IF;
  IF b.extra_charge_status = 'failed' THEN RETURN jsonb_build_object('result','failed_final'); END IF;
  IF _amount_cents IS NULL OR _amount_cents < 50 OR _amount_cents > 50000 OR _amount_cents IS DISTINCT FROM b.extra_km_charge_cents THEN
    RETURN jsonb_build_object('result','amount_mismatch');
  END IF;
  UPDATE public.bookings SET extra_charge_status = 'processing', extra_charge_cents = _amount_cents, extra_charge_claimed_at = now()
   WHERE id = _booking_id;
  RETURN jsonb_build_object('result','claimed','amount_cents',_amount_cents,'claimed_at',now());
END $$;
REVOKE ALL ON FUNCTION public.claim_extra_charge(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_extra_charge(uuid, integer) TO service_role;

-- Abschluss: zusätzlich Mehrkilometer-Sperre gegen laufenden/erfolgreichen Einzug, Zuordnung festhalten.
DROP FUNCTION IF EXISTS public.finalize_deposit_review(uuid,integer,uuid,integer,integer,integer,integer,integer);
CREATE OR REPLACE FUNCTION public.finalize_deposit_review(
  _id uuid, _expected_revision integer, _admin uuid,
  _deposit integer, _total integer, _applied integer, _outstanding integer, _refund integer, _extra_km_applied integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.deposit_reviews; b record; has_km boolean;
BEGIN
  IF _deposit < 0 OR _total < 0 OR _applied < 0 OR _outstanding < 0 OR _refund < 0 OR _extra_km_applied < 0
     OR _extra_km_applied > _applied
     OR _applied <> LEAST(_total, _deposit) OR _outstanding <> _total - _applied OR _refund <> _deposit - _applied THEN
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

-- Abschlussfelder einschließlich Mehrkilometer-Zuordnung bleiben unveränderlich.
CREATE OR REPLACE FUNCTION public.deposit_reviews_km_freeze() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'finalized' AND NEW.final_extra_km_applied_cents IS DISTINCT FROM OLD.final_extra_km_applied_cents THEN
    RAISE EXCEPTION 'DEPOSIT_REVIEW_FINALIZED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deposit_reviews_km_freeze_trg BEFORE UPDATE ON public.deposit_reviews FOR EACH ROW EXECUTE FUNCTION public.deposit_reviews_km_freeze();