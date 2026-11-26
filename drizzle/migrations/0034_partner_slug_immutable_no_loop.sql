CREATE OR REPLACE FUNCTION public.partners_slug_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'partner slug is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER partners_slug_immutable BEFORE UPDATE ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.partners_slug_immutable();
ALTER TABLE public.partners ADD CONSTRAINT partners_target_not_qr CHECK (target_path !~* '^/q(/|$)');