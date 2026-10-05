-- lovable-cron-fallback-reviewed: bestehender Mail-Erinnerungsjob, unveränderter 15-Minuten-Takt; nur Aufruf auf geschützten Token umgestellt
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('private.run_return_reminder_hook()'::regprocedure);
  d := replace(d, 'private.run_return_reminder_hook()', 'private.run_send_reminders_hook()');
  d := replace(d, '/api/public/hooks/return-reminders', '/api/public/hooks/send-reminders');
  IF position('/send-reminders?token=' in d) = 0 OR position('run_send_reminders_hook' in d) = 0 THEN
    RAISE EXCEPTION 'Vorlage unerwartet';
  END IF;
  EXECUTE d;
END $$;
REVOKE ALL ON FUNCTION private.run_send_reminders_hook() FROM PUBLIC, anon, authenticated;
SELECT cron.unschedule('mt-send-booking-reminders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mt-send-booking-reminders');
SELECT cron.schedule('mt-send-booking-reminders', '*/15 * * * *', 'SELECT private.run_send_reminders_hook();');