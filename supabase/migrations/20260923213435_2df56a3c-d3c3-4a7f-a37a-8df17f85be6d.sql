DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('private.run_manual_notification_hook()'::regprocedure) INTO d;
  d := replace(d, 'private.run_manual_notification_hook()', 'private.run_calendar_sync_hook()');
  d := replace(d, '/api/public/hooks/process-manual-notifications', '/api/public/hooks/process-calendar-sync');
  IF position('process-calendar-sync' in d) = 0 OR position('run_calendar_sync_hook' in d) = 0 THEN
    RAISE EXCEPTION 'Vorlage unerwartet';
  END IF;
  EXECUTE d;
END $$;
REVOKE ALL ON FUNCTION private.run_calendar_sync_hook() FROM PUBLIC, anon, authenticated;