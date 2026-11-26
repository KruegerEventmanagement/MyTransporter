CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  commission_rate_bp integer NOT NULL DEFAULT 1000 CHECK (commission_rate_bp BETWEEN 0 AND 5000),
  target_path text NOT NULL DEFAULT '/' CHECK (target_path ~ '^/[A-Za-z0-9/_-]*$' AND target_path NOT LIKE '//%' AND length(target_path) <= 120),
  active boolean NOT NULL DEFAULT true,
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read partners" ON public.partners FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert partners" ON public.partners FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update partners" ON public.partners FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER partners_updated_at BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.partner_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  visited_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_visits_partner_time ON public.partner_visits (partner_id, visited_at);
GRANT SELECT ON public.partner_visits TO authenticated;
GRANT ALL ON public.partner_visits TO service_role;
ALTER TABLE public.partner_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read partner visits" ON public.partner_visits FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.booking_partner_attributions (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  visit_id uuid NOT NULL REFERENCES public.partner_visits(id),
  partner_slug text NOT NULL,
  commission_rate_bp integer NOT NULL CHECK (commission_rate_bp BETWEEN 0 AND 5000),
  visited_at timestamptz NOT NULL,
  attributed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_partner_attributions_partner ON public.booking_partner_attributions (partner_id);
GRANT SELECT ON public.booking_partner_attributions TO authenticated;
GRANT ALL ON public.booking_partner_attributions TO service_role;
ALTER TABLE public.booking_partner_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read partner attributions" ON public.booking_partner_attributions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.booking_partner_attributions_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'booking_partner_attributions are immutable';
END $$;
CREATE TRIGGER booking_partner_attributions_no_update BEFORE UPDATE OR DELETE ON public.booking_partner_attributions
FOR EACH ROW EXECUTE FUNCTION public.booking_partner_attributions_immutable();

INSERT INTO public.partners (slug, name, commission_rate_bp, target_path, notes)
VALUES ('obi-leonberg', 'OBI Leonberg', 1000, '/', 'QR-Code im OBI Markt Leonberg (Schlüsselübergabe).')
ON CONFLICT (slug) DO NOTHING;