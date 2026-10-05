-- Additiv: optionale Anschrift aus Registrierungs-Metadaten übernehmen. Alle bisherigen Felder und die Admin-Benachrichtigung bleiben unverändert.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id, email, first_name, last_name, phone, account_type, company_name, vat_id,
    birth_date, birthday_marketing_consent, birthday_consent_at,
    address_street, address_postal_code, address_city, address_country
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
         THEN now() ELSE NULL END,
    NULLIF(trim(NEW.raw_user_meta_data->>'address_street'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'address_postal_code'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'address_city'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'address_country'), '')
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