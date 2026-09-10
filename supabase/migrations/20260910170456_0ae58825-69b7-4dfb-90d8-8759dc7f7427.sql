ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS length_cm integer,
  ADD COLUMN IF NOT EXISTS width_cm integer,
  ADD COLUMN IF NOT EXISTS height_cm integer,
  ADD COLUMN IF NOT EXISTS cargo_length_cm integer,
  ADD COLUMN IF NOT EXISTS cargo_width_cm integer,
  ADD COLUMN IF NOT EXISTS cargo_height_cm integer,
  ADD COLUMN IF NOT EXISTS cargo_volume_m3 numeric,
  ADD COLUMN IF NOT EXISTS pickup_location text,
  ADD COLUMN IF NOT EXISTS pickup_address text;