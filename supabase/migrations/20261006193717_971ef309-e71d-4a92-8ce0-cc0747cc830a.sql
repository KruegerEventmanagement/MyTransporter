REVOKE ALL ON FUNCTION public.user_documents_guard_customer_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_deletions_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.document_archive_guard() FROM PUBLIC, anon, authenticated;
-- Nur Auskunft über das eigene Konto (keine Prüfung fremder IDs möglich).
CREATE OR REPLACE FUNCTION public.is_account_active(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND _uid = auth.uid()
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _uid AND u.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.account_deletions d WHERE d.former_user_id = _uid AND d.status = 'completed');
$$;
REVOKE ALL ON FUNCTION public.is_account_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_active(uuid) TO authenticated;