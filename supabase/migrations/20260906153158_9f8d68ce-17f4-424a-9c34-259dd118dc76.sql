REVOKE ALL ON FUNCTION public.bookings_enforce_vehicle_availability() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.bookings_enforce_vehicle_availability() TO service_role;