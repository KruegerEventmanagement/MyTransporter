ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS return_reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_review_reason text,
  ADD COLUMN IF NOT EXISTS return_exceptions jsonb,
  ADD COLUMN IF NOT EXISTS end_km_manual boolean,
  ADD COLUMN IF NOT EXISTS return_reminder_10min_for timestamptz;