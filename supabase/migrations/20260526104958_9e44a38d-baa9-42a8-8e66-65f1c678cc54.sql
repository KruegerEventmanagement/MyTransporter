-- The 'vehicles' bucket stays public (so getPublicUrl image links keep working
-- through the CDN), but we drop the SELECT policy that lets clients LIST the
-- bucket contents via the storage API.
DROP POLICY IF EXISTS "Vehicle assets are publicly readable" ON storage.objects;