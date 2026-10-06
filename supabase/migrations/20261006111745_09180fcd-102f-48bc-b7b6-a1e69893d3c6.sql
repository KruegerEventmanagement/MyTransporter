CREATE TABLE public.issued_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('invoice','offer')),
  source text NOT NULL CHECK (source IN ('booking','manual')),
  document_number text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  document_date date NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  user_id uuid,
  customer_name text,
  customer_company text,
  customer_email text,
  billing_address jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  net_cents integer NOT NULL,
  vat_rate numeric(5,4) NOT NULL DEFAULT 0.19,
  vat_cents integer NOT NULL,
  gross_cents integer NOT NULL,
  non_taxable_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL,
  payment_status text,
  snapshot jsonb NOT NULL,
  content_hash text NOT NULL,
  pdf_path text NOT NULL,
  pdf_filename text NOT NULL,
  pdf_size_bytes integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, document_number, revision)
);
CREATE INDEX issued_documents_booking_idx ON public.issued_documents(booking_id);
CREATE INDEX issued_documents_user_idx ON public.issued_documents(user_id);
CREATE INDEX issued_documents_created_idx ON public.issued_documents(created_at DESC);

GRANT SELECT ON public.issued_documents TO authenticated;
GRANT ALL ON public.issued_documents TO service_role;
ALTER TABLE public.issued_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all issued documents" ON public.issued_documents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Customers read own issued documents" ON public.issued_documents
  FOR SELECT TO authenticated USING (user_id IS NOT NULL AND user_id = auth.uid());

-- Belege sind unveränderlich: auch der Server darf sie nicht ändern oder löschen.
CREATE OR REPLACE FUNCTION public.issued_documents_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'issued_documents are immutable';
END; $$;
CREATE TRIGGER issued_documents_no_update BEFORE UPDATE OR DELETE ON public.issued_documents
  FOR EACH ROW EXECUTE FUNCTION public.issued_documents_immutable();