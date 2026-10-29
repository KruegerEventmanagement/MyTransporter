CREATE TABLE public.key_code_sms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('booking','manual')),
  source_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','sent','failed','no_phone','gave_up')),
  attempts int NOT NULL DEFAULT 0,
  lease_until timestamptz,
  provider_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);
GRANT SELECT ON public.key_code_sms TO authenticated;
GRANT ALL ON public.key_code_sms TO service_role;
ALTER TABLE public.key_code_sms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read key sms" ON public.key_code_sms FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Atomarer Claim: liefert true nur, wenn dieser Lauf senden darf (max. 3 Versuche, Lease 2 Min.).
CREATE OR REPLACE FUNCTION public.claim_key_code_sms(_type text, _id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.key_code_sms;
BEGIN
  INSERT INTO public.key_code_sms(source_type, source_id, attempts, lease_until)
  VALUES (_type, _id, 1, now() + interval '2 minutes')
  ON CONFLICT (source_type, source_id) DO NOTHING
  RETURNING * INTO r;
  IF FOUND THEN RETURN true; END IF;
  UPDATE public.key_code_sms SET attempts = attempts + 1, status = 'processing',
    lease_until = now() + interval '2 minutes', updated_at = now()
  WHERE source_type = _type AND source_id = _id
    AND status = 'failed' AND attempts < 3
  RETURNING * INTO r;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_key_code_sms(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_key_code_sms(text, uuid) TO service_role;