ALTER TABLE public.key_code_sms ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE public.key_code_sms DROP CONSTRAINT IF EXISTS key_code_sms_status_check;
ALTER TABLE public.key_code_sms ADD CONSTRAINT key_code_sms_status_check
  CHECK (status IN ('processing','sending','sent','failed','no_phone','gave_up','unknown','cancelled'));
ALTER TABLE public.key_code_sms DROP CONSTRAINT IF EXISTS key_code_sms_source_type_check;
ALTER TABLE public.key_code_sms ADD CONSTRAINT key_code_sms_source_type_check
  CHECK (source_type IN ('booking','manual','test'));

CREATE OR REPLACE FUNCTION public.key_sms_claim(_type text, _id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t uuid := gen_random_uuid(); r public.key_code_sms;
BEGIN
  INSERT INTO public.key_code_sms(source_type, source_id, status, attempts, lease_until, lease_token)
  VALUES (_type, _id, 'processing', 0, now() + interval '2 minutes', t)
  ON CONFLICT (source_type, source_id) DO NOTHING;
  IF FOUND THEN RETURN jsonb_build_object('result','claimed','token',t); END IF;
  SELECT * INTO r FROM public.key_code_sms WHERE source_type = _type AND source_id = _id FOR UPDATE;
  IF r.status = 'sending' AND r.lease_until < now() THEN
    UPDATE public.key_code_sms SET status = 'unknown', lease_token = NULL, updated_at = now(),
      last_error = 'Abbruch während des Sendens – Zustellung unklar, keine automatische Wiederholung'
    WHERE id = r.id;
    RETURN jsonb_build_object('result','stale_sending');
  END IF;
  IF (r.status = 'processing' AND r.lease_until < now()) OR (r.status = 'failed' AND r.attempts < 3) THEN
    UPDATE public.key_code_sms SET status = 'processing', lease_until = now() + interval '2 minutes',
      lease_token = t, updated_at = now() WHERE id = r.id;
    RETURN jsonb_build_object('result','claimed','token',t);
  END IF;
  RETURN jsonb_build_object('result','skip','status',r.status);
END $$;

CREATE OR REPLACE FUNCTION public.key_sms_mark_sending(_type text, _id uuid, _token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.key_code_sms SET status = 'sending', attempts = attempts + 1,
    lease_until = now() + interval '2 minutes', updated_at = now()
  WHERE source_type = _type AND source_id = _id AND lease_token = _token
    AND status = 'processing' AND lease_until > now();
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.key_sms_finish(_type text, _id uuid, _token uuid, _status text, _provider_id text, _error text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text;
BEGIN
  IF _status NOT IN ('sent','failed','no_phone','unknown','cancelled') THEN RAISE EXCEPTION 'bad status'; END IF;
  UPDATE public.key_code_sms SET
    status = CASE WHEN _status = 'failed' AND attempts >= 3 THEN 'gave_up' ELSE _status END,
    provider_id = _provider_id, last_error = left(_error, 300), lease_token = NULL, lease_until = NULL, updated_at = now()
  WHERE source_type = _type AND source_id = _id AND lease_token = _token
    AND status IN ('processing','sending')
    AND (_status IN ('no_phone','cancelled') OR status = 'sending')
  RETURNING status INTO s;
  RETURN s;
END $$;

REVOKE ALL ON FUNCTION public.key_sms_claim(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.key_sms_mark_sending(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.key_sms_finish(text, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.key_sms_claim(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.key_sms_mark_sending(text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.key_sms_finish(text, uuid, uuid, text, text, text) TO service_role;