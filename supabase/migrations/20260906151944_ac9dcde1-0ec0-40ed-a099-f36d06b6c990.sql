CREATE OR REPLACE FUNCTION public.vehicle_conflicts_for_plan(
  _plate text,
  _plan_id text,
  _start_date date,
  _start_hour int,
  _ignore_hold_user uuid DEFAULT NULL,
  _ignore_booking_id uuid DEFAULT NULL
)
RETURNS TABLE(source text, ref_id uuid, start_at timestamptz, end_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.vehicle_conflicts(
    _plate,
    public.local_start_at(_start_date, _start_hour),
    public.plan_end_at(public.local_start_at(_start_date, _start_hour), _plan_id),
    _ignore_hold_user,
    _ignore_booking_id
  )
$$;

REVOKE ALL ON FUNCTION public.vehicle_conflicts_for_plan(text, text, date, int, uuid, uuid) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.vehicle_conflicts_for_plan(text, text, date, int, uuid, uuid) TO service_role;