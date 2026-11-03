DO $patch$
DECLARE
  fn regprocedure := 'public.report_trip_return(uuid,integer,boolean,integer,jsonb)'::regprocedure;
  definition text;
  anchor text := '  FOREACH k IN ARRAY ARRAY[''photos'',''fuel'',''receipt''] LOOP';
  addition text := E'  -- Optional customer notes are separate from evidence exemptions.\n  IF jsonb_typeof(_exceptions->''notes'') = ''string'' THEN\n    v := left(btrim(_exceptions->>''notes''), 1000);\n    IF length(v) > 0 THEN\n      ex := ex || jsonb_build_object(''notes'', v);\n    END IF;\n  END IF;\n\n';
BEGIN
  definition := pg_get_functiondef(fn);
  IF position(anchor IN definition) = 0 THEN
    RAISE EXCEPTION 'RETURN_NOTES_PATCH_ANCHOR_MISSING';
  END IF;
  IF position('jsonb_build_object(''notes'', v)' IN definition) > 0 THEN
    RAISE EXCEPTION 'RETURN_NOTES_PATCH_ALREADY_PRESENT';
  END IF;
  EXECUTE replace(definition, anchor, addition || anchor);
END
$patch$;
REVOKE ALL ON FUNCTION public.report_trip_return(uuid, integer, boolean, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_trip_return(uuid, integer, boolean, integer, jsonb) TO authenticated;