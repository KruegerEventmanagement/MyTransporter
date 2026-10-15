ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS stripe_environment text
  CHECK (stripe_environment IS NULL OR stripe_environment IN ('sandbox','live'));
COMMENT ON COLUMN public.bookings.stripe_environment IS 'Stripe-Umgebung der Originalzahlung; serverseitig gesetzt (Webhook) bzw. read-only aufgelöst.';

CREATE TABLE public.deposit_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('deposit','cancellation','legacy')),
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  payment_intent_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  request_key text,
  deposit_cents integer NOT NULL CHECK (deposit_cents >= 0),
  deduct_cents integer NOT NULL DEFAULT 0 CHECK (deduct_cents >= 0),
  fee_cents integer NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  refund_cents integer NOT NULL CHECK (refund_cents >= 0),
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','pending','requires_action','succeeded','failed','canceled','no_refund','needs_review')),
  refund_id text,
  refund_status text,
  failure_reason text,
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  stripe_called_at timestamptz,
  confirmed_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX deposit_settlements_refund_id_uniq ON public.deposit_settlements(refund_id) WHERE refund_id IS NOT NULL;
CREATE UNIQUE INDEX deposit_settlements_request_key_uniq ON public.deposit_settlements(booking_id, request_key) WHERE request_key IS NOT NULL;
-- Je Buchung und Art höchstens ein nicht gescheiterter Auftrag (kein Doppel-Geldfluss).
CREATE UNIQUE INDEX deposit_settlements_one_per_kind ON public.deposit_settlements(booking_id, kind)
  WHERE status NOT IN ('failed','canceled');
-- Gemeinsamer Buchungs-Lock: nie zwei laufende Aufträge (Kaution/Storno) gleichzeitig.
CREATE UNIQUE INDEX deposit_settlements_one_inflight ON public.deposit_settlements(booking_id)
  WHERE status IN ('processing','pending','requires_action','needs_review');
CREATE INDEX deposit_settlements_open_idx ON public.deposit_settlements(status) WHERE status IN ('processing','pending','requires_action');

GRANT SELECT ON public.deposit_settlements TO authenticated;
GRANT ALL ON public.deposit_settlements TO service_role;
ALTER TABLE public.deposit_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read deposit settlements" ON public.deposit_settlements
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Eingefrorene Beträge/Umgebung/Key dürfen nach Anlage nie mehr geändert werden.
CREATE OR REPLACE FUNCTION public.deposit_settlements_freeze()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.environment IS DISTINCT FROM OLD.environment OR NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.deposit_cents IS DISTINCT FROM OLD.deposit_cents
     OR NEW.deduct_cents IS DISTINCT FROM OLD.deduct_cents OR NEW.fee_cents IS DISTINCT FROM OLD.fee_cents
     OR NEW.refund_cents IS DISTINCT FROM OLD.refund_cents
     OR (OLD.refund_id IS NOT NULL AND NEW.refund_id IS DISTINCT FROM OLD.refund_id) THEN
    RAISE EXCEPTION 'DEPOSIT_SETTLEMENT_FROZEN';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER deposit_settlements_freeze_trg BEFORE UPDATE ON public.deposit_settlements
  FOR EACH ROW EXECUTE FUNCTION public.deposit_settlements_freeze();