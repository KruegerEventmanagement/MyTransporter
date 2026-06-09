GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO supabase_storage_admin;

DROP POLICY IF EXISTS "Admins can upload vehicle assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update vehicle assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete vehicle assets" ON storage.objects;

CREATE POLICY "Admins can upload vehicle assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vehicles'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can update vehicle assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'vehicles'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'vehicles'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete vehicle assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'vehicles'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);