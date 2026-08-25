CREATE TABLE public.vehicle_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  vehicle_plate text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vehicle_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_blocks TO authenticated;
GRANT ALL ON public.vehicle_blocks TO service_role;

ALTER TABLE public.vehicle_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view vehicle blocks" ON public.vehicle_blocks
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert vehicle blocks" ON public.vehicle_blocks
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update vehicle blocks" ON public.vehicle_blocks
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete vehicle blocks" ON public.vehicle_blocks
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_vehicle_blocks_updated_at
  BEFORE UPDATE ON public.vehicle_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX vehicle_blocks_plate_start_idx ON public.vehicle_blocks (vehicle_plate, start_at);

INSERT INTO public.vehicle_blocks (vehicle_id, vehicle_plate, start_at, end_at, reason)
VALUES
  ('b408f5fe-4a10-4c3c-9f83-ab56a3ac74a5', 'LEO MY 101', '2026-08-01 00:00:00+02', '2026-09-05 09:00:00+02', 'Vermietet'),
  ('b408f5fe-4a10-4c3c-9f83-ab56a3ac74a5', 'LEO MY 101', '2026-09-05 09:00:00+02', '2026-09-06 09:00:00+02', 'Buchung'),
  ('02220fa6-9a77-4069-8a24-f7028365808b', 'LEO MY 102', '2026-08-01 00:00:00+02', '2026-09-05 09:00:00+02', 'Noch nicht verfügbar'),
  ('02220fa6-9a77-4069-8a24-f7028365808b', 'LEO MY 102', '2026-09-19 09:00:00+02', '2026-09-21 09:00:00+02', 'Buchung');