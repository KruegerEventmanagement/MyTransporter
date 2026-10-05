-- lovable-cron-fallback-reviewed: 10-Minuten-Rückgabepush braucht Minutengenauigkeit; DB ist durch bestehenden Minuten-Kalenderjob ohnehin aktiv
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('private.run_calendar_sync_hook()'::regprocedure);
  d := replace(d, 'private.run_calendar_sync_hook()', 'private.run_return_reminder_hook()');
  d := replace(d, '/api/public/hooks/process-calendar-sync', '/api/public/hooks/return-reminders');
  IF position('return-reminders' in d) = 0 OR position('run_return_reminder_hook' in d) = 0 THEN
    RAISE EXCEPTION 'Vorlage unerwartet';
  END IF;
  EXECUTE d;
END $$;
REVOKE ALL ON FUNCTION private.run_return_reminder_hook() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('mt-return-reminders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mt-return-reminders');
SELECT cron.schedule('mt-return-reminders', '* * * * *', 'SELECT private.run_return_reminder_hook();');