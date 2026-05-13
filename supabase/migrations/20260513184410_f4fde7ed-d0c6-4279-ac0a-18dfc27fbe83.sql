ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS extra_charge_intent_id text,
  ADD COLUMN IF NOT EXISTS extra_charge_status text,
  ADD COLUMN IF NOT EXISTS extra_charge_cents integer,
  ADD COLUMN IF NOT EXISTS deposit_deducted_cents integer,
  ADD COLUMN IF NOT EXISTS deposit_refund_id text;