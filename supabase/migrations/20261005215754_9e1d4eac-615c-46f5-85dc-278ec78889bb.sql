CREATE OR REPLACE FUNCTION public.bookings_guard_customer_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL
     OR current_setting('mt.trip_return_rpc', true) = 'on'
     OR public.has_role(uid, 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.start_hour IS DISTINCT FROM OLD.start_hour
     OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.plan_label IS DISTINCT FROM OLD.plan_label
     OR NEW.plan_price IS DISTINCT FROM OLD.plan_price
     OR NEW.deposit IS DISTINCT FROM OLD.deposit
     OR NEW.deposit_status IS DISTINCT FROM OLD.deposit_status
     OR NEW.deposit_released_at IS DISTINCT FROM OLD.deposit_released_at
     OR NEW.deposit_released_by IS DISTINCT FROM OLD.deposit_released_by
     OR NEW.deposit_deducted_cents IS DISTINCT FROM OLD.deposit_deducted_cents
     OR NEW.deposit_refund_id IS DISTINCT FROM OLD.deposit_refund_id
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
     OR NEW.stripe_payment_method_id IS DISTINCT FROM OLD.stripe_payment_method_id
     OR NEW.extra_charge_intent_id IS DISTINCT FROM OLD.extra_charge_intent_id
     OR NEW.extra_charge_status IS DISTINCT FROM OLD.extra_charge_status
     OR NEW.extra_charge_cents IS DISTINCT FROM OLD.extra_charge_cents
     OR NEW.free_km IS DISTINCT FROM OLD.free_km
     OR NEW.km_price_cents IS DISTINCT FROM OLD.km_price_cents
     OR NEW.addons IS DISTINCT FROM OLD.addons
     OR NEW.addons_total_cents IS DISTINCT FROM OLD.addons_total_cents
     OR NEW.vehicle_name IS DISTINCT FROM OLD.vehicle_name
     OR NEW.vehicle_plate IS DISTINCT FROM OLD.vehicle_plate
     OR NEW.pickup_code IS DISTINCT FROM OLD.pickup_code
     OR NEW.return_code IS DISTINCT FROM OLD.return_code
     OR NEW.extra_km IS DISTINCT FROM OLD.extra_km
     OR NEW.extra_km_charge_cents IS DISTINCT FROM OLD.extra_km_charge_cents
     OR NEW.coupon_code IS DISTINCT FROM OLD.coupon_code
     OR NEW.discount_cents IS DISTINCT FROM OLD.discount_cents
     OR NEW.return_reported_at IS DISTINCT FROM OLD.return_reported_at
     OR NEW.return_review_reason IS DISTINCT FROM OLD.return_review_reason
     OR NEW.return_exceptions IS DISTINCT FROM OLD.return_exceptions
     OR NEW.return_reminder_10min_for IS DISTINCT FROM OLD.return_reminder_10min_for
     OR NEW.reminder_24h_sent_at IS DISTINCT FROM OLD.reminder_24h_sent_at
     OR NEW.reminder_30min_sent_at IS DISTINCT FROM OLD.reminder_30min_sent_at THEN
    RAISE EXCEPTION 'TRIP_FIELD_LOCKED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status IN ('paid','confirmed') AND NEW.status = 'active') THEN
    RAISE EXCEPTION 'TRIP_STATUS_LOCKED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.start_km IS DISTINCT FROM OLD.start_km
     AND OLD.status NOT IN ('paid','confirmed') THEN
    RAISE EXCEPTION 'TRIP_FIELD_LOCKED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF (NEW.end_km IS DISTINCT FROM OLD.end_km
      OR NEW.end_km_manual IS DISTINCT FROM OLD.end_km_manual
      OR NEW.ai_end_fuel_percent IS DISTINCT FROM OLD.ai_end_fuel_percent
      OR NEW.tank_level_end IS DISTINCT FROM OLD.tank_level_end)
     AND NOT (OLD.status = ANY (public.trip_active_statuses())) THEN
    RAISE EXCEPTION 'TRIP_FIELD_LOCKED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$$;

DROP POLICY IF EXISTS "Users can update own bookings" ON public.bookings;
CREATE POLICY "Users can update own bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON FUNCTION public.bookings_guard_customer_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bookings_locked_fields_unchanged(
  uuid, text, timestamp with time zone, uuid, text, text, text, text, text,
  integer, integer, text, numeric, numeric, integer, integer, jsonb, integer, uuid
) FROM PUBLIC, anon, authenticated;