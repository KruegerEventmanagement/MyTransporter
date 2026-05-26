-- 1) admin_notifications: tighten INSERT
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.admin_notifications;
CREATE POLICY "Users can create own notifications"
  ON public.admin_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = user_id
  );

-- 2) vehicles: hide sensitive columns from public visitors via column-level GRANT.
--    Public landing page only needs the marketing columns.
DROP POLICY IF EXISTS "Anyone can view vehicles" ON public.vehicles;

CREATE POLICY "Public can view vehicles"
  ON public.vehicles
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE SELECT ON public.vehicles FROM anon, authenticated;
GRANT SELECT (
  id, name, plate, brand, model, vehicle_class, body_type, color,
  fuel_type, seats, power_kw, displacement_ccm,
  empty_weight_kg, max_weight_kg, payload_kg,
  trailer_load_braked_kg, trailer_load_unbraked_kg, tire_size,
  first_registration, photo_urls, is_active, created_at, updated_at
) ON public.vehicles TO anon;
-- Authenticated users (incl. admins) keep full read access for the admin panel.
GRANT SELECT ON public.vehicles TO authenticated;

-- 3) trip-photos bucket: make private, restrict reads/writes to booking owner or admin.
UPDATE storage.buckets SET public = false WHERE id = 'trip-photos';

DROP POLICY IF EXISTS "Anyone can view trip photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload trip photos" ON storage.objects;

CREATE POLICY "Owners and admins can read trip photos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'trip-photos'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id::text = (storage.foldername(name))[1]
          AND b.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Owners can upload trip photos to own booking folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'trip-photos'
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND b.user_id = auth.uid()
    )
  );

-- 4) has_role: stop exposing the SECURITY DEFINER function to anon callers.
--    authenticated keeps EXECUTE because RLS policies invoke it.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- 5) Realtime: restrict channel subscriptions to admins only. Regular users
--    do not depend on realtime; they refresh via normal queries.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can receive realtime messages" ON realtime.messages;
CREATE POLICY "Admins can receive realtime messages"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));