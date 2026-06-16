REVOKE EXECUTE ON FUNCTION public.bookings_locked_fields_unchanged(
  uuid, text, timestamp with time zone, uuid, text, text, text, text, text,
  integer, integer, text, numeric, numeric, integer, integer, jsonb, integer, uuid
) FROM PUBLIC, anon, authenticated;