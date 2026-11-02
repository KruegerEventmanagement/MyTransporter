CREATE TABLE public.deleted_customer_contacts (
  former_user_id uuid PRIMARY KEY,
  first_name text, last_name text, email text, phone text, birth_date date,
  address jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.deleted_customer_contacts TO authenticated;
GRANT ALL ON public.deleted_customer_contacts TO service_role;
ALTER TABLE public.deleted_customer_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read deleted customer contacts" ON public.deleted_customer_contacts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));