-- has_role: switch from SECURITY DEFINER to SECURITY INVOKER. It only reads
-- user_roles, where RLS already lets each user see their own role, which is
-- exactly what `has_role(auth.uid(), ...)` checks.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$function$;