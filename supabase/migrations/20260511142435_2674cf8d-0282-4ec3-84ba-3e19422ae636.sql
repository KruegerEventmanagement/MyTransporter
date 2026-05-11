
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  plate TEXT NOT NULL DEFAULT '',
  vin TEXT,
  brand TEXT,
  model TEXT,
  vehicle_class TEXT,
  body_type TEXT,
  first_registration DATE,
  displacement_ccm INTEGER,
  power_kw INTEGER,
  fuel_type TEXT,
  seats INTEGER,
  empty_weight_kg INTEGER,
  max_weight_kg INTEGER,
  payload_kg INTEGER,
  manufacturer TEXT,
  type_variant_version TEXT,
  hsn TEXT,
  tsn TEXT,
  color TEXT,
  axles INTEGER,
  trailer_load_braked_kg INTEGER,
  trailer_load_unbraked_kg INTEGER,
  tire_size TEXT,
  owner_name TEXT,
  notes TEXT,
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  registration_doc_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view vehicles" ON public.vehicles FOR SELECT USING (true);
CREATE POLICY "Admins can insert vehicles" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update vehicles" ON public.vehicles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete vehicles" ON public.vehicles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_vehicles_updated_at
BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public) VALUES ('vehicles', 'vehicles', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Vehicle assets are publicly readable" ON storage.objects FOR SELECT USING (bucket_id = 'vehicles');
CREATE POLICY "Admins can upload vehicle assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'vehicles' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update vehicle assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'vehicles' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete vehicle assets" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'vehicles' AND has_role(auth.uid(), 'admin'::app_role));
