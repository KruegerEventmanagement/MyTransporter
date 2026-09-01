DROP TRIGGER IF EXISTS manual_reservations_time_check ON public.manual_reservations;

CREATE OR REPLACE FUNCTION public.manual_reservations_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.end_at <= NEW.start_at THEN
    RAISE EXCEPTION 'end_at must be after start_at';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER manual_reservations_validate_trigger
BEFORE INSERT OR UPDATE ON public.manual_reservations
FOR EACH ROW EXECUTE FUNCTION public.manual_reservations_validate();