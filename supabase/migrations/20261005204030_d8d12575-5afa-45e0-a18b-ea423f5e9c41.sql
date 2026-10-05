DROP POLICY IF EXISTS "Public can view vehicle blocks" ON public.vehicle_blocks;
REVOKE SELECT ON public.vehicle_blocks FROM anon;
CREATE POLICY "Admins can view vehicle blocks" ON public.vehicle_blocks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));