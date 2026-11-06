CREATE TABLE public.customer_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  source text NOT NULL DEFAULT 'profile',
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_change_log_user_idx ON public.customer_change_log(user_id, changed_at);
GRANT SELECT ON public.customer_change_log TO authenticated;
GRANT ALL ON public.customer_change_log TO service_role;
ALTER TABLE public.customer_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read change log" ON public.customer_change_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.customer_change_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'customer_change_log is append-only'; END $$;
CREATE TRIGGER customer_change_log_no_change BEFORE UPDATE OR DELETE ON public.customer_change_log
FOR EACH ROW EXECUTE FUNCTION public.customer_change_log_immutable();

CREATE OR REPLACE FUNCTION public.log_profile_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; o jsonb; n jsonb;
BEGIN
  n := to_jsonb(NEW);
  o := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  FOREACH k IN ARRAY ARRAY['first_name','last_name','phone','email','birth_date','account_type','company_name','vat_id','address_street','address_postal_code','address_city','address_country'] LOOP
    IF (n->>k) IS DISTINCT FROM (o->>k) AND NOT (TG_OP='INSERT' AND n->>k IS NULL) THEN
      INSERT INTO public.customer_change_log(user_id, field, old_value, new_value, source)
      VALUES (NEW.id, k, o->>k, n->>k, CASE WHEN TG_OP='INSERT' THEN 'registrierung' ELSE 'profil' END);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_log_changes AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.log_profile_changes();

-- Backfill: current state as earliest known entry
INSERT INTO public.customer_change_log(user_id, field, old_value, new_value, source, changed_at)
SELECT p.id, kv.key, NULL, kv.value, 'bestand', p.created_at
FROM public.profiles p, jsonb_each_text(to_jsonb(p)) kv
WHERE kv.key = ANY(ARRAY['first_name','last_name','phone','email','birth_date','account_type','company_name','vat_id','address_street','address_postal_code','address_city','address_country'])
  AND kv.value IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_email_changed AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email_from_auth();