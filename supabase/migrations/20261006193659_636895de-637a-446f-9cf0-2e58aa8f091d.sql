-- A) Buchungen dürfen bei Kontolöschung nicht mitgelöscht werden (Belege/Verträge bleiben zuordenbar).
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_user_id_fkey;
CREATE INDEX IF NOT EXISTS bookings_user_id_idx ON public.bookings(user_id);

-- B) Audit der Kontolöschungen (minimal, nur Admin lesbar, Zeitpunkte servergeneriert).
CREATE TABLE IF NOT EXISTS public.account_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  former_user_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','processing','failed','completed')),
  account_created_at timestamptz,
  requested_at timestamptz NOT NULL DEFAULT now(),
  request_reason text,
  completed_at timestamptz,
  booking_count integer,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.account_deletions TO authenticated;
GRANT ALL ON public.account_deletions TO service_role;
ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view account deletions" ON public.account_deletions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.account_deletions_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'account_deletions ist unveränderlich';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.requested_at := now();
    NEW.completed_at := CASE WHEN NEW.status = 'completed' THEN now() END;
    RETURN NEW;
  END IF;
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'Abgeschlossene Kontolöschung ist unveränderlich';
  END IF;
  NEW.former_user_id := OLD.former_user_id;
  NEW.requested_at := OLD.requested_at;
  NEW.created_at := OLD.created_at;
  NEW.account_created_at := COALESCE(OLD.account_created_at, NEW.account_created_at);
  NEW.completed_at := CASE WHEN NEW.status = 'completed' THEN now() END;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER account_deletions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.account_deletions
  FOR EACH ROW EXECUTE FUNCTION public.account_deletions_guard();

-- Atomare Steuerung (nur Server).
CREATE OR REPLACE FUNCTION public.claim_account_deletion(_uid uuid, _account_created_at timestamptz, _lease_seconds integer DEFAULT 120)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s text;
BEGIN
  INSERT INTO public.account_deletions(former_user_id, account_created_at, status)
  VALUES (_uid, _account_created_at, 'requested') ON CONFLICT (former_user_id) DO NOTHING;
  UPDATE public.account_deletions
     SET status = 'processing', attempts = attempts + 1,
         locked_until = now() + make_interval(secs => GREATEST(_lease_seconds, 30)),
         account_created_at = COALESCE(account_created_at, _account_created_at)
   WHERE former_user_id = _uid
     AND (status IN ('requested','failed') OR (status = 'processing' AND locked_until < now()))
  RETURNING status INTO _s;
  IF _s IS NOT NULL THEN RETURN 'claimed'; END IF;
  SELECT status INTO _s FROM public.account_deletions WHERE former_user_id = _uid;
  RETURN COALESCE(_s, 'unknown');
END $$;

CREATE OR REPLACE FUNCTION public.request_account_deletion(_uid uuid, _account_created_at timestamptz, _reason text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t timestamptz;
BEGIN
  INSERT INTO public.account_deletions(former_user_id, account_created_at, status, request_reason)
  VALUES (_uid, _account_created_at, 'requested', left(_reason, 300)) ON CONFLICT (former_user_id) DO NOTHING;
  SELECT requested_at INTO _t FROM public.account_deletions WHERE former_user_id = _uid;
  RETURN _t;
END $$;

CREATE OR REPLACE FUNCTION public.complete_account_deletion(_uid uuid, _booking_count integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t timestamptz;
BEGIN
  UPDATE public.account_deletions SET status = 'completed', booking_count = _booking_count,
         last_error = NULL, locked_until = NULL
   WHERE former_user_id = _uid AND status <> 'completed';
  SELECT completed_at INTO _t FROM public.account_deletions WHERE former_user_id = _uid;
  RETURN _t;
END $$;

CREATE OR REPLACE FUNCTION public.fail_account_deletion(_uid uuid, _error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.account_deletions SET status = 'failed', last_error = left(_error, 300), locked_until = NULL
   WHERE former_user_id = _uid AND status <> 'completed';
END $$;

REVOKE ALL ON FUNCTION public.claim_account_deletion(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_account_deletion(uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_account_deletion(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_account_deletion(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_account_deletion(uuid, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(uuid, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_account_deletion(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_account_deletion(uuid, text) TO service_role;

-- C) Gelöschte Konten verlieren mit alten JWTs jeden Kundenzugriff.
CREATE OR REPLACE FUNCTION public.is_account_active(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _uid AND u.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.account_deletions d WHERE d.former_user_id = _uid AND d.status = 'completed');
$$;
REVOKE ALL ON FUNCTION public.is_account_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_active(uuid) TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bookings','profiles','user_documents','trip_photos','gps_tracks','push_subscriptions','native_push_tokens','booking_holds','birthday_campaigns']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Only active accounts" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Only active accounts" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.is_account_active(auth.uid()))) WITH CHECK ((SELECT public.is_account_active(auth.uid())))', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "Only active accounts" ON storage.objects;
CREATE POLICY "Only active accounts" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.is_account_active(auth.uid()))) WITH CHECK ((SELECT public.is_account_active(auth.uid())));

-- D) Dokumente aus dem Kundenkonto entfernen + befristetes Adminarchiv.
ALTER TABLE public.user_documents ADD COLUMN IF NOT EXISTS removed_from_account_at timestamptz;

CREATE OR REPLACE FUNCTION public.user_documents_guard_customer_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.user_id := OLD.user_id;
    NEW.doc_type := OLD.doc_type;
    NEW.photo_url := OLD.photo_url;
    NEW.removed_from_account_at := OLD.removed_from_account_at;
    IF OLD.deleted_by_user_at IS NOT NULL THEN NEW.deleted_by_user_at := OLD.deleted_by_user_at; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS user_documents_guard_customer_update ON public.user_documents;
CREATE TRIGGER user_documents_guard_customer_update BEFORE UPDATE ON public.user_documents
  FOR EACH ROW EXECUTE FUNCTION public.user_documents_guard_customer_update();

CREATE TABLE IF NOT EXISTS public.document_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  doc_type text NOT NULL,
  storage_path text,
  archived_at timestamptz NOT NULL DEFAULT now(),
  retention_until timestamptz NOT NULL,
  retention_reason text NOT NULL,
  legal_hold_until timestamptz,
  legal_hold_reason text,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_archive_due_idx ON public.document_archive(retention_until) WHERE purged_at IS NULL;
GRANT SELECT ON public.document_archive TO authenticated;
GRANT ALL ON public.document_archive TO service_role;
ALTER TABLE public.document_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view document archive" ON public.document_archive
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.document_archive_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.archived_at := now();
    NEW.purged_at := NULL;
    IF NEW.legal_hold_until IS NOT NULL THEN RAISE EXCEPTION 'Prüfvermerk nicht beim Archivieren'; END IF;
    RETURN NEW;
  END IF;
  NEW.id := OLD.id; NEW.source_document_id := OLD.source_document_id; NEW.user_id := OLD.user_id;
  NEW.doc_type := OLD.doc_type; NEW.archived_at := OLD.archived_at; NEW.created_at := OLD.created_at;
  NEW.retention_reason := OLD.retention_reason;
  IF NEW.retention_until > OLD.retention_until THEN RAISE EXCEPTION 'Aufbewahrung darf nicht verlängert werden'; END IF;
  IF OLD.purged_at IS NOT NULL THEN RAISE EXCEPTION 'Bereits gelöscht'; END IF;
  IF NEW.legal_hold_until IS DISTINCT FROM OLD.legal_hold_until AND NEW.legal_hold_until IS NOT NULL THEN
    IF coalesce(length(trim(NEW.legal_hold_reason)), 0) < 10 THEN RAISE EXCEPTION 'Prüfvermerk braucht Begründung'; END IF;
    IF NEW.legal_hold_until > now() + interval '180 days' THEN RAISE EXCEPTION 'Prüfvermerk höchstens 180 Tage'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_archive_guard BEFORE INSERT OR UPDATE ON public.document_archive
  FOR EACH ROW EXECUTE FUNCTION public.document_archive_guard();