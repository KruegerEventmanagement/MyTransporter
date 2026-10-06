import type { PrivacyStore } from "./privacy-ops.server";

const USER_BUCKET = "user-documents";
export const ARCHIVE_BUCKET = "document-archive";

function check(error: { message?: string; code?: string } | null | undefined, step: string) {
  if (error) throw new Error(`${step}: ${error.code ?? ""} ${error.message ?? ""}`.trim());
}

/** Adapter auf den privilegierten Server-Client. Nur in Server-Handlern verwenden. */
export async function createPrivacyStore(): Promise<PrivacyStore> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  return {
    async listDocs(uid, types) {
      const { data, error } = await db
        .from("user_documents")
        .select("id, user_id, doc_type, photo_url, created_at")
        .eq("user_id", uid)
        .in("doc_type", types as string[])
        .is("removed_from_account_at", null);
      check(error, "Dokumente lesen");
      return data ?? [];
    },
    async listBookings(uid) {
      const { data, error } = await db
        .from("bookings")
        .select("id, status, start_date, start_hour, plan_id")
        .eq("user_id", uid);
      check(error, "Buchungen lesen");
      return data ?? [];
    },
    async archiveExists(id) {
      const { data, error } = await db.from("document_archive").select("id").eq("source_document_id", id).maybeSingle();
      check(error, "Archiv lesen");
      return !!data;
    },
    async download(path) {
      const { data, error } = await supabaseAdmin.storage.from(USER_BUCKET).download(path);
      if (error) {
        if (/not.?found|404|does not exist/i.test(`${error.message} ${(error as { status?: number }).status ?? ""}`)) return null;
        throw new Error(`Download: ${error.message}`);
      }
      if (!data) return null;
      return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || "image/jpeg" };
    },
    async uploadArchive(path, bytes, contentType) {
      const { error } = await supabaseAdmin.storage
        .from(ARCHIVE_BUCKET)
        .upload(path, bytes, { contentType, upsert: false });
      if (error && !/exist|duplicate/i.test(error.message)) throw new Error(`Archiv-Upload: ${error.message}`);
    },
    async insertArchive(row) {
      const { error } = await db.from("document_archive").insert(row);
      if (error && error.code !== "23505") check(error, "Archiv-Eintrag");
    },
    async removeUserFiles(paths) {
      if (!paths.length) return;
      const { error } = await supabaseAdmin.storage.from(USER_BUCKET).remove(paths);
      check(error, "Datei entfernen");
    },
    async markRemoved(id, uid) {
      const now = new Date().toISOString();
      const { error } = await db
        .from("user_documents")
        .update({ removed_from_account_at: now })
        .eq("id", id)
        .eq("user_id", uid)
        .is("removed_from_account_at", null);
      check(error, "Dokument markieren");
      await db.from("user_documents").update({ deleted_by_user_at: now }).eq("id", id).is("deleted_by_user_at", null);
    },
    async claimDeletion(uid, createdAt) {
      const { data, error } = await db.rpc("claim_account_deletion", { _uid: uid, _account_created_at: createdAt, _lease_seconds: 120 });
      check(error, "Löschung starten");
      return String(data);
    },
    async requestDeletion(uid, createdAt, reason) {
      const { data, error } = await db.rpc("request_account_deletion", { _uid: uid, _account_created_at: createdAt, _reason: reason });
      check(error, "Löschantrag");
      return data ?? null;
    },
    async completeDeletion(uid, count) {
      const { data, error } = await db.rpc("complete_account_deletion", { _uid: uid, _booking_count: count });
      check(error, "Löschung abschließen");
      return data ?? null;
    },
    async failDeletion(uid, msg) {
      await db.rpc("fail_account_deletion", { _uid: uid, _error: msg });
    },
    async deletionStatus(uid) {
      const { data } = await db
        .from("account_deletions")
        .select("status, requested_at, completed_at")
        .eq("former_user_id", uid)
        .maybeSingle();
      return data ?? null;
    },
    async listUserFiles(uid) {
      const { data, error } = await supabaseAdmin.storage.from(USER_BUCKET).list(uid, { limit: 1000 });
      check(error, "Dateien auflisten");
      return (data ?? []).map((f) => `${uid}/${f.name}`);
    },
    async deleteUserDocumentRows(uid) {
      const { error } = await db.from("user_documents").delete().eq("user_id", uid);
      check(error, "Dokumenteinträge löschen");
    },
    async deleteDevicesAndMarketing(uid) {
      for (const t of ["push_subscriptions", "native_push_tokens", "booking_holds", "birthday_campaigns"]) {
        const { error } = await db.from(t).delete().eq("user_id", uid);
        check(error, `${t} löschen`);
      }
    },
    async countBookings(uid) {
      const { count, error } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("user_id", uid);
      check(error, "Buchungen zählen");
      return count ?? 0;
    },
    async deleteAuthUser(uid) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(uid, false);
      if (!error) return "deleted";
      if ((error as { status?: number }).status === 404 || /not.?found/i.test(error.message)) return "missing";
      throw new Error(`Auth-Konto: ${error.message}`);
    },
    async deleteProfile(uid) {
      const { error } = await db.from("profiles").delete().eq("id", uid);
      check(error, "Profil löschen");
    },
    async listDueArchive(nowIso, limit) {
      const { data, error } = await db
        .from("document_archive")
        .select("id, storage_path, legal_hold_until")
        .is("purged_at", null)
        .lt("retention_until", nowIso)
        .or(`legal_hold_until.is.null,legal_hold_until.lt.${nowIso}`)
        .limit(limit);
      check(error, "Fällige Archivkopien");
      return data ?? [];
    },
    async removeArchiveFile(path) {
      const { error } = await supabaseAdmin.storage.from(ARCHIVE_BUCKET).remove([path]);
      check(error, "Archivdatei löschen");
    },
    async markPurged(id) {
      const { error } = await db
        .from("document_archive")
        .update({ purged_at: new Date().toISOString(), storage_path: null })
        .eq("id", id);
      check(error, "Archiv markieren");
    },
  };
}
