CREATE TABLE public.mail_provider_attempts (
 idempotency_key text PRIMARY KEY,
 provider text NOT NULL CHECK(provider IN ('gmail','resend')),
 payload_hash text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','failed','needs_review')),
 ambiguous boolean NOT NULL DEFAULT false,
 lease_token uuid,
 lease_until timestamptz,
 provider_message_id text,
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz,
 error_status integer,
 error_kind text,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mail_provider_attempts TO service_role;
ALTER TABLE public.mail_provider_attempts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.mail_provider_attempts IS 'Server-only Gmail send fence. No recipients or DOB. Unknown acceptance never auto-retries.';
ALTER TABLE public.customer_mail_outbox ADD COLUMN mail_provider text NOT NULL DEFAULT 'resend' CHECK(mail_provider IN ('resend','gmail'));
ALTER TABLE public.manual_reservation_customer_mails ADD COLUMN mail_provider text NOT NULL DEFAULT 'resend' CHECK(mail_provider IN ('resend','gmail'));
CREATE FUNCTION public.mail_provider_binding_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.mail_provider IS DISTINCT FROM OLD.mail_provider THEN RAISE EXCEPTION 'mail provider is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER customer_mail_provider_immutable BEFORE UPDATE ON public.customer_mail_outbox FOR EACH ROW EXECUTE FUNCTION public.mail_provider_binding_immutable();
CREATE TRIGGER manual_mail_provider_immutable BEFORE UPDATE ON public.manual_reservation_customer_mails FOR EACH ROW EXECUTE FUNCTION public.mail_provider_binding_immutable();
CREATE FUNCTION public.claim_gmail_attempt(_key text,_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.mail_provider_attempts; tok uuid:=gen_random_uuid();
BEGIN
 INSERT INTO public.mail_provider_attempts(idempotency_key,provider,payload_hash) VALUES(_key,'gmail',_hash) ON CONFLICT DO NOTHING;
 SELECT * INTO r FROM public.mail_provider_attempts WHERE idempotency_key=_key FOR UPDATE;
 IF r.provider<>'gmail' OR r.payload_hash<>_hash THEN RETURN jsonb_build_object('result','needs_review'); END IF;
 IF r.status='sent' THEN RETURN jsonb_build_object('result','sent','provider_id',r.provider_message_id); END IF;
 IF r.status='processing' AND r.lease_until>now() THEN RETURN jsonb_build_object('result','in_progress'); END IF;
 IF r.ambiguous OR r.status IN ('processing','needs_review') THEN
 UPDATE public.mail_provider_attempts SET status='needs_review',updated_at=now() WHERE idempotency_key=_key;
 RETURN jsonb_build_object('result','needs_review'); END IF;
 IF r.next_attempt_at>now() THEN RETURN jsonb_build_object('result','backoff'); END IF;
 UPDATE public.mail_provider_attempts SET status='processing',ambiguous=true,lease_token=tok,lease_until=now()+interval '90 seconds',attempts=attempts+1,updated_at=now() WHERE idempotency_key=_key;
 RETURN jsonb_build_object('result','claimed','lease_token',tok);
END $$;
CREATE FUNCTION public.complete_gmail_attempt(_key text,_token uuid,_provider_id text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF _provider_id IS NULL OR _provider_id !~ '^[a-fA-F0-9]{8,64}$' THEN RETURN false; END IF;
 UPDATE public.mail_provider_attempts SET status='sent',ambiguous=false,provider_message_id=_provider_id,lease_token=NULL,lease_until=NULL,last_error=NULL,error_kind=NULL,updated_at=now() WHERE idempotency_key=_key AND status='processing' AND lease_token=_token; RETURN FOUND; END $$;
CREATE FUNCTION public.fail_gmail_attempt(_key text,_token uuid,_status integer,_kind text,_ambiguous boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE public.mail_provider_attempts SET status=CASE WHEN _ambiguous THEN 'needs_review' ELSE 'failed' END,ambiguous=_ambiguous,error_status=_status,error_kind=left(_kind,60),last_error='Gmail request failed; inspect provider status',lease_token=NULL,lease_until=NULL,next_attempt_at=now()+interval '10 minutes',updated_at=now() WHERE idempotency_key=_key AND status='processing' AND lease_token=_token; RETURN FOUND; END $$;
REVOKE ALL ON FUNCTION public.claim_gmail_attempt(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_gmail_attempt(text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fail_gmail_attempt(text,uuid,integer,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gmail_attempt(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_gmail_attempt(text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_gmail_attempt(text,uuid,integer,text,boolean) TO service_role;