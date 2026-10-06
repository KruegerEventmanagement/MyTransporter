import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Nicht berechtigt");
}

/** Kontolöschungen + Dokumentarchiv (nur Admin, per RLS gelesen). */
export const listPrivacyRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const db = context.supabase as any;
    const [{ data: deletions }, { data: archive }] = await Promise.all([
      db
        .from("account_deletions")
        .select("id, former_user_id, status, account_created_at, requested_at, completed_at, booking_count, attempts, last_error")
        .order("requested_at", { ascending: false })
        .limit(300),
      db
        .from("document_archive")
        .select("id, user_id, doc_type, archived_at, retention_until, retention_reason, legal_hold_until, legal_hold_reason, purged_at")
        .order("archived_at", { ascending: false })
        .limit(300),
    ]);
    return { deletions: deletions ?? [], archive: archive ?? [] };
  });

/** Kurzlebiger Link auf eine Archivkopie – ausschließlich für Admins. */
export const getArchivedDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(d?.id))) throw new Error("Ungültig");
    return { id: d.id };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row } = await (context.supabase as any)
      .from("document_archive")
      .select("storage_path, purged_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!row?.storage_path || row.purged_at) return { url: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ARCHIVE_BUCKET } = await import("@/lib/privacy-store.server");
    const { data: s } = await supabaseAdmin.storage.from(ARCHIVE_BUCKET).createSignedUrl(row.storage_path, 60);
    return { url: s?.signedUrl ?? null };
  });
