REVOKE ALL ON FUNCTION public.vehicle_conflicts(text, timestamptz, timestamptz, uuid, uuid) FROM authenticated, anon, public;
REVOKE ALL ON FUNCTION public.is_vehicle_available(text, timestamptz, timestamptz, uuid, uuid) FROM authenticated, anon, public;
REVOKE ALL ON FUNCTION public.create_booking_hold_atomic(uuid, uuid, text, text, date, int, int) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.vehicle_conflicts(text, timestamptz, timestamptz, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_vehicle_available(text, timestamptz, timestamptz, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_hold_atomic(uuid, uuid, text, text, date, int, int) TO service_role;