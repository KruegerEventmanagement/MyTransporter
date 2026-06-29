
REVOKE ALL ON FUNCTION public.delete_expired_booking_holds() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_expired_booking_holds() FROM anon;
REVOKE ALL ON FUNCTION public.delete_expired_booking_holds() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_booking_holds() TO service_role;
