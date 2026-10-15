-- lovable-cron-fallback-reviewed: Owner explicitly requested a 5-minute catch-up for invoice/review mails; job stays inactive until reviewed publish.
CREATE TABLE public.review_mail_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('booking','manual')),
  source_id uuid NOT NULL,
  user_id uuid,
  email_lower text,
  granted boolean NOT NULL,
  consent_version text NOT NULL,
  consent_text text NOT NULL,
  origin text NOT NULL CHECK (origin IN ('online_checkout','admin_manual')),
  recorded_by uuid,
  granted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);
GRANT SELECT ON public.review_mail_consents TO authenticated;
GRANT ALL ON public.review_mail_consents TO service_role;
ALTER TABLE public.review_mail_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read review consents" ON public.review_mail_consents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.review_mail_consents_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'review consent records are immutable';
END $$;
CREATE TRIGGER review_mail_consents_no_update BEFORE UPDATE OR DELETE ON public.review_mail_consents
  FOR EACH ROW EXECUTE FUNCTION public.review_mail_consents_immutable();

-- Admin-Retry nur für eindeutig abgelehnte Versuche. Unklare/needs_review nie per Knopf zurücksetzen.
CREATE OR REPLACE FUNCTION public.release_customer_mail_for_retry(_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r public.customer_mail_outbox;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO r FROM public.customer_mail_outbox WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF r.status <> 'failed' OR r.ambiguous THEN
    RAISE EXCEPTION 'retry_not_allowed: Ergebnis unklar oder Prüfung nötig – erst Abgleich beim Mailanbieter';
  END IF;
  UPDATE public.customer_mail_outbox SET next_attempt_at = now() WHERE id = _id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.release_customer_mail_for_retry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_customer_mail_for_retry(uuid) TO authenticated;

DO $$
BEGIN
  PERFORM cron.alter_job(job_id := j.jobid, schedule := '*/5 * * * *', active := false)
  FROM cron.job j WHERE j.jobname = 'mt-process-customer-mails';
END $$;