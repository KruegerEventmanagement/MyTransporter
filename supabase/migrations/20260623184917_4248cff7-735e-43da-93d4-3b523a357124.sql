
alter table public.profiles
  add column if not exists account_type text not null default 'private',
  add column if not exists company_name text,
  add column if not exists vat_id text;

alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles add constraint profiles_account_type_check check (account_type in ('private','business'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, phone, account_type, company_name, vat_id)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'last_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'account_type', ''), 'private'),
    NULLIF(NEW.raw_user_meta_data->>'company_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'vat_id', '')
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
