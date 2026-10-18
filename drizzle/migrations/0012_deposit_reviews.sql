CREATE TABLE public.deposit_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('booking','manual')),
  source_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  revision integer NOT NULL DEFAULT 1,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  customer_message text,
  manual_deposit_cents integer CHECK (manual_deposit_cents IS NULL OR (manual_deposit_cents >= 0 AND manual_deposit_cents <= 500000)),
  manual_deposit_method text CHECK (manual_deposit_method IS NULL OR manual_deposit_method IN ('cash','transfer','sumup','none','other')),
  manual_deposit_recorded_at timestamptz,
  manual_deposit_recorded_by uuid,
  final_deposit_cents integer,
  final_deduct_total_cents integer,
  final_deduct_applied_cents integer,
  final_outstanding_cents integer,
  final_refund_cents integer,
  settlement_id uuid REFERENCES public.deposit_settlements(id) ON DELETE RESTRICT,
  finalized_at timestamptz,
  finalized_by uuid,
  manual_payout_status text CHECK (manual_payout_status IS NULL OR manual_payout_status IN ('not_required','open','confirmed')),
  manual_payout_method text CHECK (manual_payout_method IS NULL OR manual_payout_method IN ('cash','transfer','sumup','other')),
  manual_payout_confirmed_at timestamptz,
  manual_payout_confirmed_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);
GRANT SELECT ON public.deposit_reviews TO authenticated;
GRANT ALL ON public.deposit_reviews TO service_role;
ALTER TABLE public.deposit_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read deposit reviews" ON public.deposit_reviews FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

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
CREATE TRIGGER deposit_reviews_guard_trg BEFORE UPDATE ON public.deposit_reviews FOR EACH ROW EXECUTE FUNCTION public.deposit_reviews_guard();

-- Gemeinsamer Buchungslock: Abschluss vs. Storno serialisieren.
CREATE OR REPLACE FUNCTION public.finalize_deposit_review(
  _id uuid, _expected_revision integer, _admin uuid,
  _deposit integer, _total integer, _applied integer, _outstanding integer, _refund integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.deposit_reviews; b record;
BEGIN
  IF _deposit < 0 OR _total < 0 OR _applied < 0 OR _outstanding < 0 OR _refund < 0
     OR _applied <> LEAST(_total, _deposit) OR _outstanding <> _total - _applied OR _refund <> _deposit - _applied THEN
    RAISE EXCEPTION 'DEPOSIT_AMOUNTS_INCONSISTENT';
  END IF;
  SELECT * INTO r FROM public.deposit_reviews WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result','not_found'); END IF;
  IF r.status = 'finalized' THEN RETURN jsonb_build_object('result','already_finalized'); END IF;
  IF r.revision <> _expected_revision THEN RETURN jsonb_build_object('result','stale_revision'); END IF;
  IF r.source_type = 'booking' THEN
    SELECT id, status INTO b FROM public.bookings WHERE id = r.source_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('result','not_found'); END IF;
    IF b.status = 'cancelled' OR EXISTS (SELECT 1 FROM public.deposit_settlements s WHERE s.booking_id = r.source_id
         AND s.kind IN ('cancellation','legacy') AND s.status NOT IN ('failed','canceled')) THEN
      RETURN jsonb_build_object('result','cancelled');
    END IF;
  END IF;
  UPDATE public.deposit_reviews SET status = 'finalized', finalized_at = now(), finalized_by = _admin, updated_by = _admin,
    final_deposit_cents = _deposit, final_deduct_total_cents = _total, final_deduct_applied_cents = _applied,
    final_outstanding_cents = _outstanding, final_refund_cents = _refund,
    manual_payout_status = CASE WHEN r.source_type = 'manual' THEN (CASE WHEN _refund > 0 THEN 'open' ELSE 'not_required' END) ELSE NULL END
  WHERE id = _id;
  RETURN jsonb_build_object('result','finalized');
END $$;
REVOKE ALL ON FUNCTION public.finalize_deposit_review(uuid,integer,uuid,integer,integer,integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_deposit_review(uuid,integer,uuid,integer,integer,integer,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.deposit_settlements_cancel_lock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind = 'cancellation' THEN
    PERFORM 1 FROM public.bookings WHERE id = NEW.booking_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.deposit_reviews WHERE source_type = 'booking' AND source_id = NEW.booking_id AND status = 'finalized') THEN
      RAISE EXCEPTION 'DEPOSIT_ALREADY_REVIEWED';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deposit_settlements_cancel_lock_trg BEFORE INSERT ON public.deposit_settlements FOR EACH ROW EXECUTE FUNCTION public.deposit_settlements_cancel_lock();

-- Mail-Outbox: neue Arten für Kautionsprüfung (additiv).
ALTER TABLE public.customer_mail_outbox DROP CONSTRAINT IF EXISTS customer_mail_outbox_kind_check;
ALTER TABLE public.customer_mail_outbox ADD CONSTRAINT customer_mail_outbox_kind_check CHECK (kind = ANY (ARRAY['invoice','review_request','reminder_24h','reminder_30min','return_reminder','booking_confirmation','admin_booking','deposit_review_admin','deposit_digest','deposit_closing']));
ALTER TABLE public.customer_mail_outbox DROP CONSTRAINT IF EXISTS customer_mail_outbox_source_type_check;
ALTER TABLE public.customer_mail_outbox ADD CONSTRAINT customer_mail_outbox_source_type_check CHECK (source_type = ANY (ARRAY['booking','manual','digest']));

ALTER TABLE public.customer_mail_settings ADD COLUMN IF NOT EXISTS deposit_review_from timestamptz;
UPDATE public.customer_mail_settings SET deposit_review_from = now() WHERE id = true AND deposit_review_from IS NULL;

-- Fällige Kautionsprüfungen ab Aktivierung (Rückgabe gemeldet oder geplantes Ende erreicht).
CREATE OR REPLACE FUNCTION public.deposit_review_due_sources(_from timestamptz, _limit integer)
RETURNS TABLE(source_type text, source_id uuid, event_at timestamptz, return_reported boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM (
    SELECT 'booking'::text, b.id,
           COALESCE(b.return_reported_at, public.plan_end_at(public.local_start_at(b.start_date, b.start_hour), b.plan_id)),
           b.return_reported_at IS NOT NULL
      FROM public.bookings b
     WHERE b.status IN ('paid','active','in_progress','picked_up','returning','return_pending','completed')
       AND b.deposit_status <> 'released'
       AND COALESCE(b.return_reported_at, public.plan_end_at(public.local_start_at(b.start_date, b.start_hour), b.plan_id)) BETWEEN _from AND now()
    UNION ALL
    SELECT 'manual'::text, m.id, m.end_at, false
      FROM public.manual_reservations m
     WHERE m.end_at BETWEEN _from AND now()
  ) q(source_type, source_id, event_at, return_reported)
  WHERE NOT EXISTS (SELECT 1 FROM public.customer_mail_outbox o WHERE o.source_type = q.source_type AND o.source_id = q.source_id AND o.kind = 'deposit_review_admin')
    AND NOT EXISTS (SELECT 1 FROM public.deposit_reviews r WHERE r.source_type = q.source_type AND r.source_id = q.source_id AND r.status = 'finalized')
  ORDER BY q.event_at LIMIT GREATEST(LEAST(_limit, 100), 1)
$$;
REVOKE ALL ON FUNCTION public.deposit_review_due_sources(timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deposit_review_due_sources(timestamptz, integer) TO service_role;