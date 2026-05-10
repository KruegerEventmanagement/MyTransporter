
-- 1. Backfill existing profiles with first_name/last_name/phone from auth.users metadata
UPDATE public.profiles p
SET
  first_name = COALESCE(p.first_name, NULLIF(u.raw_user_meta_data->>'first_name', '')),
  last_name  = COALESCE(p.last_name,  NULLIF(u.raw_user_meta_data->>'last_name', '')),
  phone      = COALESCE(p.phone,      NULLIF(u.raw_user_meta_data->>'phone', ''))
FROM auth.users u
WHERE u.id = p.id
  AND (p.first_name IS NULL OR p.last_name IS NULL OR p.phone IS NULL);

-- 2. Update trigger to persist name/phone on new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'last_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  );

  INSERT INTO public.admin_notifications (type, title, body, user_id)
  VALUES (
    'user_registered',
    'Neue Registrierung',
    COALESCE(NEW.email, 'Unbekannte E-Mail') || ' hat sich registriert.',
    NEW.id
  );

  RETURN NEW;
END;
$function$;

-- 3. User documents table (ID & driver's license photos)
CREATE TABLE IF NOT EXISTS public.user_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  doc_type text NOT NULL, -- 'id_front','id_back','license_front','license_back'
  photo_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
ON public.user_documents FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
ON public.user_documents FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin can view all documents"
ON public.user_documents FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Storage bucket for user identity documents (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-documents', 'user-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload own identity docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'user-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read own identity docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'user-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can read all identity docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'user-documents' AND public.has_role(auth.uid(), 'admin'::app_role));
