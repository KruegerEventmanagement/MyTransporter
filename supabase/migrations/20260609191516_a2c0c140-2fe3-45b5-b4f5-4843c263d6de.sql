ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS ai_start_km integer,
  ADD COLUMN IF NOT EXISTS ai_end_km integer,
  ADD COLUMN IF NOT EXISTS ai_start_fuel_percent integer,
  ADD COLUMN IF NOT EXISTS ai_end_fuel_percent integer;