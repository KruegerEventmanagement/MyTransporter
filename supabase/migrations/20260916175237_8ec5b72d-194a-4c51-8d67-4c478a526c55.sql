ALTER TABLE public.manual_reservations
  ADD COLUMN IF NOT EXISTS customer_birth_date date,
  ADD COLUMN IF NOT EXISTS customer_street text,
  ADD COLUMN IF NOT EXISTS customer_city text,
  ADD COLUMN IF NOT EXISTS customer_id_number text,
  ADD COLUMN IF NOT EXISTS customer_license_number text;

CREATE TABLE IF NOT EXISTS public.manual_reservation_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES public.manual_reservations(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'other',
  file_path text NOT NULL,
  original_name text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manual_reservation_documents_reservation_idx
  ON public.manual_reservation_documents(reservation_id);

GRANT SELECT, INSERT, DELETE ON public.manual_reservation_documents TO authenticated;
GRANT ALL ON public.manual_reservation_documents TO service_role;

ALTER TABLE public.manual_reservation_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view manual reservation documents"
ON public.manual_reservation_documents FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can add manual reservation documents"
ON public.manual_reservation_documents FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete manual reservation documents"
ON public.manual_reservation_documents FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));