ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_30min_sent_at timestamptz;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove old job if any
DO $$
BEGIN
  PERFORM cron.unschedule('mt-send-booking-reminders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'mt-send-booking-reminders',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--fa378654-91c3-451b-94cc-9ffff72f236f.lovable.app/api/public/hooks/send-reminders',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucGJ2ZG1tcndmdmVudXJxd3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwOTMwMTAsImV4cCI6MjA5MzY2OTAxMH0.9FnP3w9AnSnMfREpXJWiSL_Du_YI_RluSf4Z6vhnCJs"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);