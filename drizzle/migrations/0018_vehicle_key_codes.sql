CREATE TABLE public.vehicle_key_codes (
  vehicle_id uuid PRIMARY KEY REFERENCES public.vehicles(id) ON DELETE CASCADE,
  key_code text NOT NULL CHECK (key_code ~ '^[0-9A-Za-z]{3,16}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_key_codes TO authenticated;
GRANT ALL ON public.vehicle_key_codes TO service_role;
ALTER TABLE public.vehicle_key_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage key codes" ON public.vehicle_key_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
COMMENT ON TABLE public.vehicle_key_codes IS 'Feste Schlüsselkasten-Codes je Fahrzeug; nur Admin/Server, Versand nur in der 15-Minuten-Mail.';