ALTER TABLE public.vehicles
  ALTER COLUMN length_cm TYPE numeric(7,1),
  ALTER COLUMN width_cm TYPE numeric(7,1),
  ALTER COLUMN height_cm TYPE numeric(7,1),
  ALTER COLUMN cargo_length_cm TYPE numeric(7,1),
  ALTER COLUMN cargo_width_cm TYPE numeric(7,1),
  ALTER COLUMN cargo_height_cm TYPE numeric(7,1),
  ADD COLUMN IF NOT EXISTS cargo_width_between_arches_cm numeric(7,1),
  ADD COLUMN IF NOT EXISTS rear_door_width_cm numeric(7,1),
  ADD COLUMN IF NOT EXISTS rear_door_height_cm numeric(7,1),
  ADD COLUMN IF NOT EXISTS side_door_width_cm numeric(7,1),
  ADD COLUMN IF NOT EXISTS side_door_height_cm numeric(7,1),
  ADD COLUMN IF NOT EXISTS specs_status text,
  ADD COLUMN IF NOT EXISTS specs_source text;
COMMENT ON COLUMN public.vehicles.specs_status IS 'Herkunft der Karosseriemaße, z. B. werksangabe_modellvariante / unbestaetigt';
COMMENT ON COLUMN public.vehicles.specs_source IS 'Quellenverweis der Karosseriemaße (nicht Fahrzeugschein)';