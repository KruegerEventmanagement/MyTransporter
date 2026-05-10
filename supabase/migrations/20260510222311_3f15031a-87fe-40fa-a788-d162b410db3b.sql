-- Extend handle_new_user trigger to also create admin notification on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);

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

-- Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();