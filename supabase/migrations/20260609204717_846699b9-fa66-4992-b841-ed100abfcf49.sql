DROP POLICY IF EXISTS "Users can update own bookings" ON public.bookings;

CREATE OR REPLACE FUNCTION public.bookings_locked_fields_unchanged(
  _id uuid,
  _deposit_status text,
  _deposit_released_at timestamptz,
  _deposit_released_by uuid,
  _stripe_customer_id text,
  _stripe_payment_intent_id text,
  _stripe_payment_method_id text,
  _extra_charge_intent_id text,
  _extra_charge_status text,
  _extra_charge_cents integer,
  _deposit_deducted_cents integer,
  _deposit_refund_id text,
  _plan_price numeric,
  _deposit numeric,
  _free_km integer,
  _km_price_cents integer,
  _addons jsonb,
  _addons_total_cents integer,
  _user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = _id
      AND b.user_id IS NOT DISTINCT FROM _user_id
      AND b.deposit_status IS NOT DISTINCT FROM _deposit_status
      AND b.deposit_released_at IS NOT DISTINCT FROM _deposit_released_at
      AND b.deposit_released_by IS NOT DISTINCT FROM _deposit_released_by
      AND b.stripe_customer_id IS NOT DISTINCT FROM _stripe_customer_id
      AND b.stripe_payment_intent_id IS NOT DISTINCT FROM _stripe_payment_intent_id
      AND b.stripe_payment_method_id IS NOT DISTINCT FROM _stripe_payment_method_id
      AND b.extra_charge_intent_id IS NOT DISTINCT FROM _extra_charge_intent_id
      AND b.extra_charge_status IS NOT DISTINCT FROM _extra_charge_status
      AND b.extra_charge_cents IS NOT DISTINCT FROM _extra_charge_cents
      AND b.deposit_deducted_cents IS NOT DISTINCT FROM _deposit_deducted_cents
      AND b.deposit_refund_id IS NOT DISTINCT FROM _deposit_refund_id
      AND b.plan_price IS NOT DISTINCT FROM _plan_price
      AND b.deposit IS NOT DISTINCT FROM _deposit
      AND b.free_km IS NOT DISTINCT FROM _free_km
      AND b.km_price_cents IS NOT DISTINCT FROM _km_price_cents
      AND b.addons IS NOT DISTINCT FROM _addons
      AND b.addons_total_cents IS NOT DISTINCT FROM _addons_total_cents
  )
$$;

REVOKE ALL ON FUNCTION public.bookings_locked_fields_unchanged(
  uuid, text, timestamptz, uuid, text, text, text, text, text, integer,
  integer, text, numeric, numeric, integer, integer, jsonb, integer, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bookings_locked_fields_unchanged(
  uuid, text, timestamptz, uuid, text, text, text, text, text, integer,
  integer, text, numeric, numeric, integer, integer, jsonb, integer, uuid
) TO authenticated;

CREATE POLICY "Users can update own bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND public.bookings_locked_fields_unchanged(
    id,
    deposit_status,
    deposit_released_at,
    deposit_released_by,
    stripe_customer_id,
    stripe_payment_intent_id,
    stripe_payment_method_id,
    extra_charge_intent_id,
    extra_charge_status,
    extra_charge_cents,
    deposit_deducted_cents,
    deposit_refund_id,
    plan_price,
    deposit,
    free_km,
    km_price_cents,
    addons,
    addons_total_cents,
    user_id
  )
);