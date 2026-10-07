DROP POLICY IF EXISTS "Users can insert own bookings" ON public.bookings;
REVOKE INSERT ON public.bookings FROM anon, authenticated;
GRANT ALL ON public.bookings TO service_role;