ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS birthday_marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS birthday_consent_at timestamptz;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.birthday_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  birthday_on date NOT NULL,
  coupon_code text NOT NULL UNIQUE,
  discount_percent integer NOT NULL DEFAULT 20,
  valid_from date NOT NULL,
  valid_until date NOT NULL,
  email_status text NOT NULL DEFAULT 'pending',
  email_error text,
  sent_at timestamptz,
  redeemed_at timestamptz,
  redeemed_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  discount_cents integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, year)
);

GRANT SELECT ON public.birthday_campaigns TO authenticated;
GRANT ALL ON public.birthday_campaigns TO service_role;

ALTER TABLE public.birthday_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own birthday campaigns"
  ON public.birthday_campaigns FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all birthday campaigns"
  ON public.birthday_campaigns FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER birthday_campaigns_set_updated_at
  BEFORE UPDATE ON public.birthday_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS birthday_campaigns_user_year_idx
  ON public.birthday_campaigns (user_id, year);

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id, email, first_name, last_name, phone, account_type, company_name, vat_id,
    birth_date, birthday_marketing_consent, birthday_consent_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'last_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'account_type', ''), 'private'),
    NULLIF(NEW.raw_user_meta_data->>'company_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'vat_id', ''),
    NULLIF(NEW.raw_user_meta_data->>'birth_date', '')::date,
    COALESCE((NEW.raw_user_meta_data->>'birthday_marketing_consent')::boolean, false),
    CASE WHEN COALESCE((NEW.raw_user_meta_data->>'birthday_marketing_consent')::boolean, false)
         THEN now() ELSE NULL END
  );

  INSERT INTO public.admin_notifications (type, title, body, user_id)
  VALUES (
    'user_registered',
    'Neue Registrierung',
    COALESCE(NEW.email, 'Unbekannte E-Mail') || ' hat sich registriert.',
    NEW.id
  );

  RETURN NEW;
END;
$function$;