-- Behaltene Speicherobjekte (Fahrtfotos) vor Auth-Löschung vom Login-Besitzer lösen; nur eigene Objekte, nichts wird gelöscht.
CREATE OR REPLACE FUNCTION public.release_retained_storage_ownership(_uid uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE n integer;
BEGIN
  UPDATE storage.objects SET owner = NULL, owner_id = NULL
   WHERE (owner = _uid OR owner_id = _uid::text)
     AND bucket_id IN ('trip-photos', 'issued-documents', 'document-archive');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.release_retained_storage_ownership(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_retained_storage_ownership(uuid) TO service_role;

-- Zählt noch verbliebene eigene Objekte (Vorabprüfung vor Auth-Löschung).
CREATE OR REPLACE FUNCTION public.count_user_owned_storage(_uid uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, storage AS $$
  SELECT count(*)::int FROM storage.objects WHERE owner = _uid OR owner_id = _uid::text;
$$;
REVOKE ALL ON FUNCTION public.count_user_owned_storage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_user_owned_storage(uuid) TO service_role;

-- Atomarer Mailtest-Claim: Sperre pro Admin, Idempotenz pro request_id, max. 1 pro Minute.
CREATE OR REPLACE FUNCTION public.claim_mail_test(_admin uuid, _request uuid, _test_id text, _cooldown_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.mail_test_runs%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('mail_test:' || _admin::text, 0));
  SELECT * INTO r FROM public.mail_test_runs WHERE request_id = _request;
  IF FOUND THEN
    RETURN jsonb_build_object('state','duplicate','status',r.status,'test_id',r.test_id,'created_at',r.created_at);
  END IF;
  IF EXISTS (SELECT 1 FROM public.mail_test_runs WHERE admin_id = _admin
             AND created_at > now() - make_interval(secs => GREATEST(_cooldown_seconds, 1))) THEN
    RETURN jsonb_build_object('state','rate_limited');
  END IF;
  INSERT INTO public.mail_test_runs(admin_id, request_id, test_id) VALUES (_admin, _request, _test_id)
  RETURNING * INTO r;
  RETURN jsonb_build_object('state','claimed','test_id',r.test_id,'created_at',r.created_at);
END $$;
REVOKE ALL ON FUNCTION public.claim_mail_test(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mail_test(uuid, uuid, text, integer) TO service_role;