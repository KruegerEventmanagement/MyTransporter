ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS addons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS addons_total_cents integer NOT NULL DEFAULT 0;