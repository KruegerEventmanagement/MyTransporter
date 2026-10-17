CREATE OR REPLACE FUNCTION public.enqueue_booking_email_intent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_TABLE_NAME='bookings' THEN
  IF NEW.status NOT IN ('paid','active','in_progress','picked_up','returning','completed') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN IF OLD.status IN ('paid','active','in_progress','picked_up','returning','completed') THEN RETURN NEW; END IF; END IF;
  INSERT INTO public.booking_email_intents(source_type,source_id,snapshot) VALUES('booking',NEW.id,jsonb_build_object('id',NEW.id,'user_id',NEW.user_id,'created_at',NEW.created_at,'vehicle_name',NEW.vehicle_name,'vehicle_plate',NEW.vehicle_plate,'plan_id',NEW.plan_id,'plan_label',NEW.plan_label,'plan_price',NEW.plan_price,'start_date',NEW.start_date,'start_hour',NEW.start_hour,'pickup_code',NEW.pickup_code,'addons',NEW.addons,'addons_total_cents',NEW.addons_total_cents)) ON CONFLICT DO NOTHING;
 ELSE
  IF NOT NEW.confirmation_requested THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN IF OLD.confirmation_requested AND OLD.revision=NEW.revision THEN RETURN NEW; END IF; END IF;
  INSERT INTO public.booking_email_intents(source_type,source_id,revision,snapshot) VALUES('manual',NEW.id,NEW.revision,jsonb_build_object('id',NEW.id,'revision',NEW.revision,'customer_name',NEW.customer_name,'customer_email',NEW.customer_email,'vehicle_name',NEW.vehicle_name,'vehicle_plate',NEW.vehicle_plate,'start_at',NEW.start_at,'end_at',NEW.end_at,'total_price_cents',NEW.total_price_cents,'pickup_address',NEW.pickup_address,'confirmation_requested',true)) ON CONFLICT DO NOTHING;
 END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.enqueue_booking_email_intent() FROM PUBLIC,anon,authenticated;