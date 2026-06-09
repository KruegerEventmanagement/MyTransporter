CREATE POLICY "Admins can read vehicle assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vehicles'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);