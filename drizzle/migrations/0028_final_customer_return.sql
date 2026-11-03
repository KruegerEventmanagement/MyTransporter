DO $patch$
DECLARE
  fn regprocedure := 'public.report_trip_return(uuid,integer,boolean,integer,jsonb)'::regprocedure;
  d text;
  a1 text := '  IF b.status = ANY (public.trip_returning_statuses()) AND b.return_code IS NOT NULL THEN';
  r1 text := '  IF (b.status = ANY (public.trip_returning_statuses()) OR b.status = ''completed'') AND b.return_code IS NOT NULL THEN';
  a2 text := '    status = ''returning'',';
  r2 text := '    status = ''completed'',';
  a3 text := 'THEN ''Rückgabe steht an'' ELSE ''Rückgabe gemeldet – Prüfung nötig'' END';
  r3 text := 'THEN ''Fahrzeug zurückgegeben'' ELSE ''Fahrzeug zurückgegeben – Prüfung nötig'' END';
BEGIN
  d := pg_get_functiondef(fn);
  IF position(a1 IN d) = 0 OR position(a2 IN d) = 0 THEN
    RAISE EXCEPTION 'FINAL_RETURN_PATCH_ANCHOR_MISSING';
  END IF;
  d := replace(replace(d, a1, r1), a2, r2);
  d := replace(d, a3, r3);
  EXECUTE d;
END
$patch$;
REVOKE ALL ON FUNCTION public.report_trip_return(uuid, integer, boolean, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_trip_return(uuid, integer, boolean, integer, jsonb) TO authenticated;