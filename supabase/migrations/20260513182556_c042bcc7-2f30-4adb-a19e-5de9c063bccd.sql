ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS free_km integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_km integer,
  ADD COLUMN IF NOT EXISTS extra_km_charge_cents integer,
  ADD COLUMN IF NOT EXISTS km_price_cents integer NOT NULL DEFAULT 90;