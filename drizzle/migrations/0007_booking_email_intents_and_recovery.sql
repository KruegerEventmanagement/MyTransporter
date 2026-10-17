CREATE TABLE public.booking_email_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_type text NOT NULL CHECK(source_type IN ('booking','manual')), source_id uuid NOT NULL, revision integer NOT NULL DEFAULT 1, snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')), next_attempt_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0, last_error text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, UNIQUE(source_type,source_id,revision)
);
GRANT SELECT ON public.booking_email_intents TO authenticated;
GRANT ALL ON public.booking_email_intents TO service_role;
ALTER TABLE public.booking_email_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read booking email intents" ON public.booking_email_intents FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE INDEX booking_email_intents_due ON public.booking_email_intents(next_attempt_at,id) WHERE status='pending';
CREATE FUNCTION public.booking_email_intent_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.source_id IS DISTINCT FROM OLD.source_id OR NEW.source_type IS DISTINCT FROM OLD.source_type OR NEW.revision IS DISTINCT FROM OLD.revision THEN RAISE EXCEPTION 'email intent is immutable'; END IF;
 IF OLD.status='completed' AND NEW.status<>'completed' THEN RAISE EXCEPTION 'completed intent is final'; END IF; RETURN NEW; END $$;
CREATE TRIGGER booking_email_intent_immutable BEFORE UPDATE ON public.booking_email_intents FOR EACH ROW EXECUTE FUNCTION public.booking_email_intent_immutable();
CREATE FUNCTION public.enqueue_booking_email_intent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_TABLE_NAME='bookings' THEN
  IF NEW.status NOT IN ('paid','active','in_progress','picked_up','returning','completed') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN IF OLD.status IN ('paid','active','in_progress','picked_up','returning','completed') THEN RETURN NEW; END IF; END IF;
  INSERT INTO public.booking_email_intents(source_type,source_id,snapshot) VALUES('booking',NEW.id,jsonb_build_object('id',NEW.id,'user_id',NEW.user_id,'created_at',NEW.created_at,'vehicle_name',NEW.vehicle_name,'vehicle_plate',NEW.vehicle_plate,'plan_id',NEW.plan_id,'plan_label',NEW.plan_label,'plan_price',NEW.plan_price,'start_date',NEW.start_date,'start_hour',NEW.start_hour,'pickup_code',NEW.pickup_code,'addons',NEW.addons,'addons_total_cents',NEW.addons_total_cents)) ON CONFLICT DO NOTHING;
 ELSE
  IF NOT NEW.confirmation_requested THEN RETURN NEW; END IF;
  INSERT INTO public.booking_email_intents(source_type,source_id,revision,snapshot) VALUES('manual',NEW.id,NEW.revision,jsonb_build_object('id',NEW.id,'revision',NEW.revision,'customer_name',NEW.customer_name,'customer_email',NEW.customer_email,'vehicle_name',NEW.vehicle_name,'vehicle_plate',NEW.vehicle_plate,'start_at',NEW.start_at,'end_at',NEW.end_at,'total_price_cents',NEW.total_price_cents,'pickup_address',NEW.pickup_address,'confirmation_requested',true)) ON CONFLICT DO NOTHING;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER bookings_enqueue_email_intent AFTER INSERT OR UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.enqueue_booking_email_intent();
CREATE TRIGGER manual_reservations_enqueue_email_intent AFTER INSERT OR UPDATE ON public.manual_reservations FOR EACH ROW EXECUTE FUNCTION public.enqueue_booking_email_intent();
ALTER TABLE public.customer_mail_outbox DROP CONSTRAINT customer_mail_outbox_kind_check;
ALTER TABLE public.customer_mail_outbox ADD CONSTRAINT customer_mail_outbox_kind_check CHECK(kind IN ('invoice','review_request','reminder_24h','reminder_30min','return_reminder','booking_confirmation','admin_booking'));
ALTER TABLE public.manual_reservation_customer_mails ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
CREATE OR REPLACE FUNCTION public.claim_customer_confirmation(_id uuid,_lease_seconds integer,_safe_seconds integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.manual_reservation_customer_mails; tok uuid:=gen_random_uuid(); BEGIN
 SELECT * INTO r FROM public.manual_reservation_customer_mails WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('result','not_found'); END IF;
 IF r.status='sent' THEN RETURN jsonb_build_object('result','sent'); END IF;
 IF r.payload IS NULL THEN RETURN jsonb_build_object('result','no_payload'); END IF;
 IF r.status='processing' AND r.lease_until>now() THEN RETURN jsonb_build_object('result','in_progress'); END IF;
 IF (r.status='processing' OR r.ambiguous) AND r.first_attempt_at<now()-make_interval(secs=>_safe_seconds) THEN RETURN jsonb_build_object('result','needs_review'); END IF;
 IF r.next_attempt_at>now() THEN RETURN jsonb_build_object('result','backoff'); END IF;
 UPDATE public.manual_reservation_customer_mails SET status='processing',lease_token=tok,lease_until=now()+make_interval(secs=>_lease_seconds),attempts=attempts+1,first_attempt_at=CASE WHEN r.ambiguous OR r.status='processing' THEN COALESCE(first_attempt_at,now()) ELSE now() END,sending_started_at=now(),ambiguous=true WHERE id=_id;
 RETURN jsonb_build_object('result','claimed','lease_token',tok,'prior_ambiguous',r.ambiguous OR r.status='processing'); END $$;
CREATE OR REPLACE FUNCTION public.fail_customer_confirmation(_id uuid,_lease_token uuid,_kind text,_error text,_ambiguous boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE public.manual_reservation_customer_mails SET status='failed',error_kind=_kind,last_error=left(_error,500),ambiguous=_ambiguous,lease_until=NULL,lease_token=NULL,next_attempt_at=now()+make_interval(secs=>CASE WHEN _kind IN ('invalid_key','missing_key','restricted_key','sender_domain') THEN 3600 ELSE 600 END) WHERE id=_id AND status='processing' AND lease_token=_lease_token; RETURN FOUND; END $$;
REVOKE ALL ON FUNCTION public.enqueue_booking_email_intent() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.booking_email_due_intents(_limit integer) RETURNS SETOF public.booking_email_intents LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT * FROM public.booking_email_intents WHERE status='pending' AND next_attempt_at<=now() ORDER BY next_attempt_at,id LIMIT GREATEST(LEAST(_limit,25),1) $$;
REVOKE ALL ON FUNCTION public.booking_email_due_intents(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.booking_email_due_intents(integer) TO service_role;
COMMENT ON TABLE public.booking_email_intents IS 'Atomic email-only snapshots for future paid online bookings and requested manual revisions; no historical backfill or queue replay.';