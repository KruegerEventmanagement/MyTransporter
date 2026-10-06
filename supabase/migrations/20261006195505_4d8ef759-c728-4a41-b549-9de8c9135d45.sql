-- lovable-cron-fallback-reviewed: neuer stündlicher Datenschutz-Job, Token nur im Header aus private.app_config
ALTER TABLE public.account_deletions ADD COLUMN IF NOT EXISTS lease_token uuid;

DROP FUNCTION IF EXISTS public.claim_account_deletion(uuid, timestamptz, integer);
DROP FUNCTION IF EXISTS public.complete_account_deletion(uuid, integer);
DROP FUNCTION IF EXISTS public.fail_account_deletion(uuid, text);

-- Claim mit Fencing-Token. _create=false: nur bereits beantragte Löschungen (Worker/Admin-Retry).
CREATE OR REPLACE FUNCTION public.claim_account_deletion_lease(_uid uuid, _account_created_at timestamptz, _lease_seconds integer, _create boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s text; _t uuid := gen_random_uuid();
BEGIN
  IF _create THEN
    INSERT INTO public.account_deletions(former_user_id, account_created_at, status)
    VALUES (_uid, _account_created_at, 'requested') ON CONFLICT (former_user_id) DO NOTHING;
  END IF;
  UPDATE public.account_deletions
     SET status = 'processing', attempts = attempts + 1, lease_token = _t,
         locked_until = now() + make_interval(secs => LEAST(GREATEST(_lease_seconds, 60), 900)),
         account_created_at = COALESCE(account_created_at, _account_created_at)
   WHERE former_user_id = _uid
     AND (status IN ('requested','failed') OR (status = 'processing' AND locked_until < now()))
  RETURNING status INTO _s;
  IF _s IS NOT NULL THEN RETURN jsonb_build_object('state','claimed','token',_t); END IF;
  SELECT status INTO _s FROM public.account_deletions WHERE former_user_id = _uid;
  RETURN jsonb_build_object('state', COALESCE(_s,'unknown'));
END $$;

CREATE OR REPLACE FUNCTION public.complete_account_deletion_lease(_uid uuid, _token uuid, _booking_count integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t timestamptz;
BEGIN
  UPDATE public.account_deletions SET status = 'completed', booking_count = _booking_count,
         last_error = NULL, locked_until = NULL, lease_token = NULL
   WHERE former_user_id = _uid AND status = 'processing' AND lease_token = _token
  RETURNING completed_at INTO _t;
  IF _t IS NULL THEN RAISE EXCEPTION 'lease_lost'; END IF;
  RETURN _t;
END $$;

CREATE OR REPLACE FUNCTION public.fail_account_deletion_lease(_uid uuid, _token uuid, _error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.account_deletions SET status = 'failed', last_error = left(_error, 300), locked_until = NULL, lease_token = NULL
   WHERE former_user_id = _uid AND status = 'processing' AND lease_token = _token;
  RETURN FOUND;
END $$;

-- Verlängert nur den eigenen aktiven Claim.
CREATE OR REPLACE FUNCTION public.renew_account_deletion_lease(_uid uuid, _token uuid, _lease_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.account_deletions SET locked_until = now() + make_interval(secs => LEAST(GREATEST(_lease_seconds, 60), 900))
   WHERE former_user_id = _uid AND status = 'processing' AND lease_token = _token AND locked_until > now();
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.claim_account_deletion_lease(uuid, timestamptz, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_account_deletion_lease(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_account_deletion_lease(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_account_deletion_lease(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_account_deletion_lease(uuid, timestamptz, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_account_deletion_lease(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_account_deletion_lease(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_account_deletion_lease(uuid, uuid, integer) TO service_role;

-- Gelöschte/inaktive Konten dürfen die Rückgabe-RPC nicht mehr ausführen (SECURITY DEFINER umgeht RLS).
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.report_trip_return(uuid, integer, boolean, integer, jsonb)'::regprocedure);
  IF position('account_inactive' in d) = 0 THEN
    n := regexp_replace(d, '\nBEGIN\n', E'\nBEGIN\n  IF NOT public.is_account_active(auth.uid()) THEN RAISE EXCEPTION ''account_inactive'' USING ERRCODE = ''42501''; END IF;\n');
    IF n = d OR position('account_inactive' in n) = 0 THEN RAISE EXCEPTION 'Vorlage unerwartet'; END IF;
    EXECUTE n;
  END IF;
END $$;

-- Kunden sehen aus dem Konto entfernte Dokumente nicht mehr; Admin-Policy bleibt getrennt.
DROP POLICY IF EXISTS "Users can view own documents" ON public.user_documents;
CREATE POLICY "Users can view own documents" ON public.user_documents
  FOR SELECT TO authenticated USING (auth.uid() = user_id AND removed_from_account_at IS NULL);

-- Stündlicher Datenschutz-Job (Löschanträge wiederaufnehmen, abgelaufene Archivkopien löschen).
CREATE OR REPLACE FUNCTION private.run_privacy_maintenance_hook()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public AS $$
DECLARE v_token text; v_url text; v_base text;
BEGIN
  SELECT value INTO v_token FROM private.app_config WHERE key = 'notify_hook_token';
  SELECT value INTO v_url FROM private.app_config WHERE key = 'notify_hook_url';
  IF v_token IS NULL OR v_url IS NULL THEN RETURN; END IF;
  v_base := regexp_replace(v_url, '/api/public/hooks/.*$', '');
  PERFORM net.http_post(
    url := v_base || '/api/public/hooks/purge-document-archive',
    headers := jsonb_build_object('Content-Type','application/json','x-hook-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
EXCEPTION WHEN OTHERS THEN RETURN;
END $$;
REVOKE ALL ON FUNCTION private.run_privacy_maintenance_hook() FROM PUBLIC, anon, authenticated;
SELECT cron.unschedule('mt-privacy-maintenance') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mt-privacy-maintenance');
SELECT cron.schedule('mt-privacy-maintenance', '23 * * * *', 'SELECT private.run_privacy_maintenance_hook();');