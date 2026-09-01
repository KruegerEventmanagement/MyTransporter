CREATE TABLE public.manual_reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  vehicle_plate text NOT NULL,
  vehicle_name text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  customer_name text NOT NULL,
  customer_phone text,
  customer_email text,
  note text,
  reminder_enabled boolean NOT NULL DEFAULT true,
  notify_customer boolean NOT NULL DEFAULT false,
  reminder_24h_sent_at timestamptz,
  reminder_30min_sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_reservations TO authenticated;
GRANT ALL ON public.manual_reservations TO service_role;

ALTER TABLE public.manual_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view manual reservations"
ON public.manual_reservations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert manual reservations"
ON public.manual_reservations FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update manual reservations"
ON public.manual_reservations FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete manual reservations"
ON public.manual_reservations FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_manual_reservations_updated_at
BEFORE UPDATE ON public.manual_reservations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX manual_reservations_start_at_idx ON public.manual_reservations (start_at);
CREATE INDEX manual_reservations_plate_idx ON public.manual_reservations (vehicle_plate);

CREATE TRIGGER manual_reservations_time_check
BEFORE INSERT OR UPDATE ON public.manual_reservations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();