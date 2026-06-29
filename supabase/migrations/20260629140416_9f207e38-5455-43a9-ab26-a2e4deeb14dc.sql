
CREATE TABLE public.booking_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  vehicle_plate text,
  plan_id text NOT NULL,
  start_date date NOT NULL,
  start_hour integer NOT NULL CHECK (start_hour >= 0 AND start_hour < 24),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_holds TO authenticated;
GRANT ALL ON public.booking_holds TO service_role;

ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own holds"
  ON public.booking_holds FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own holds"
  ON public.booking_holds FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own holds"
  ON public.booking_holds FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX booking_holds_slot_idx
  ON public.booking_holds (vehicle_plate, start_date, start_hour, expires_at);

CREATE INDEX booking_holds_user_idx
  ON public.booking_holds (user_id, expires_at);

CREATE OR REPLACE FUNCTION public.delete_expired_booking_holds()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.booking_holds WHERE expires_at < now();
$$;
