ALTER TABLE public.manual_reservations
  ADD COLUMN IF NOT EXISTS total_price_cents integer,
  ADD COLUMN IF NOT EXISTS pickup_address text;
ALTER TABLE public.manual_reservations
  ADD CONSTRAINT manual_reservations_total_price_range
  CHECK (total_price_cents IS NULL OR (total_price_cents >= 0 AND total_price_cents <= 10000000));
COMMENT ON COLUMN public.manual_reservations.total_price_cents IS 'Vereinbarter Gesamtmietpreis in Cent; NULL = nicht hinterlegt (Altbestand). Kein Zahlungsstatus.';
COMMENT ON COLUMN public.manual_reservations.pickup_address IS 'Snapshot des Abholorts zum Zeitpunkt der Erfassung.';

CREATE TABLE public.manual_reservation_customer_mails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.manual_reservations(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  recipient_email text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  ambiguous boolean NOT NULL DEFAULT false,
  error_kind text,
  last_error text,
  provider_message_id text,
  first_attempt_at timestamptz,
  lease_until timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, revision)
);
GRANT SELECT ON public.manual_reservation_customer_mails TO authenticated;
GRANT ALL ON public.manual_reservation_customer_mails TO service_role;
ALTER TABLE public.manual_reservation_customer_mails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read customer mails" ON public.manual_reservation_customer_mails
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER manual_reservation_customer_mails_updated_at
  BEFORE UPDATE ON public.manual_reservation_customer_mails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();