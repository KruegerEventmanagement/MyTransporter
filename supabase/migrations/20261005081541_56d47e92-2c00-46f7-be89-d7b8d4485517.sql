-- Optionale Anschrift für Online-Kunden (rückwärtskompatibel, alle Felder nullable)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_postal_code text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_country text;