import type { PrivacyStore } from "./privacy-ops.server";

const USER_BUCKET = "user-documents";
export const ARCHIVE_BUCKET = "document-archive";
const LEASE_SECONDS = 300;

function check(error: { message?: string; code?: string } | null | undefined, step: string) {
  if (error) throw new Error(`${step}: ${error.code ?? ""} ${error.message ?? ""}`.trim());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

/** Adapter auf einen privilegierten Server-Client. `client` nur für Tests injizieren. */
export async function createPrivacyStore(client?: AnyDb): Promise<PrivacyStore> {
  const admin: AnyDb = client ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const db = admin;
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
      const { data, error } = await db.from("bookings").select("id, status, start_date, start_hour, plan_id").eq("user_id", uid);
      check(error, "Buchungen lesen");
      return data ?? [];
    },
    async getArchive(id) {
      const { data, error } = await db.from("document_archive").select("storage_path").eq("source_document_id", id).maybeSingle();
      check(error, "Archiv lesen");
      return data ?? null;
    },
    async archiveObjectExists(path) {
      const i = path.lastIndexOf("/");
      const folder = path.slice(0, i);
      const name = path.slice(i + 1);
      const { data, error } = await admin.storage.from(ARCHIVE_BUCKET).list(folder, { search: name, limit: 20 });
      check(error, "Archivobjekt prüfen");
      return (data ?? []).some((f: { name: string }) => f.name === name);
    },
    async download(path) {
      const { data, error } = await admin.storage.from(USER_BUCKET).download(path);
      if (error) {
        if (/not.?found|404|does not exist/i.test(`${error.message} ${(error as { status?: number }).status ?? ""}`)) return null;
        throw new Error(`Download: ${error.message}`);
      }
      if (!data) return null;
      return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || "image/jpeg" };
    },
    async uploadArchive(path, bytes, contentType) {
      const { error } = await admin.storage.from(ARCHIVE_BUCKET).upload(path, bytes, { contentType, upsert: false });
      if (error && !/exist|duplicate/i.test(error.message)) throw new Error(`Archiv-Upload: ${error.message}`);
    },
    async insertArchive(row) {
      const { error } = await db.from("document_archive").insert(row);
      if (error && error.code !== "23505") check(error, "Archiv-Eintrag");
    },
    async removeArchiveFile(path) {
      const { error } = await admin.storage.from(ARCHIVE_BUCKET).remove([path]);
      check(error, "Archivdatei löschen");
    },
    async removeUserFiles(paths) {
      if (!paths.length) return;
      const { error } = await admin.storage.from(USER_BUCKET).remove(paths);
      check(error, "Datei entfernen");
    },
    async markRemoved(id, uid) {
      const read = async () => {
        const { data, error } = await db
          .from("user_documents")
          .select("deleted_by_user_at, removed_from_account_at")
          .eq("id", id)
          .eq("user_id", uid)
          .maybeSingle();
        check(error, "Dokument lesen");
        return data as { deleted_by_user_at: string | null; removed_from_account_at: string | null } | null;
      };
      const row = await read();
      if (!row) throw new Error("Dokument nicht gefunden");
      if (row.removed_from_account_at) return;
      const now = new Date().toISOString();
      const { data, error } = await db
        .from("user_documents")
        .update({ removed_from_account_at: now, deleted_by_user_at: row.deleted_by_user_at ?? now })
        .eq("id", id)
        .eq("user_id", uid)
        .is("removed_from_account_at", null)
        .select("id");
      check(error, "Dokument markieren");
      if (!data?.length) {
        const again = await read();
        if (!again?.removed_from_account_at) throw new Error("Dokument markieren: kein Treffer");
      }
    },
    async isAdminUser(uid) {
      const { data, error } = await db.from("user_roles").select("id").eq("user_id", uid).eq("role", "admin").limit(1);
      check(error, "Rolle prüfen");
      return (data ?? []).length > 0;
    },
    async claimDeletion(uid, createdAt, create) {
      const { data, error } = await db.rpc("claim_account_deletion_lease", {
        _uid: uid,
        _account_created_at: createdAt,
        _lease_seconds: LEASE_SECONDS,
        _create: create,
      });
      check(error, "Löschung starten");
      const d = (data ?? {}) as { state?: string; token?: string };
      return d.state === "claimed" && d.token ? { state: "claimed", token: d.token } : { state: d.state ?? "unknown" };
    },
    async renewDeletion(uid, token) {
      const { data, error } = await db.rpc("renew_account_deletion_lease", { _uid: uid, _token: token, _lease_seconds: LEASE_SECONDS });
      check(error, "Löschung verlängern");
      return data === true;
    },
    async requestDeletion(uid, createdAt, reason) {
      const { data, error } = await db.rpc("request_account_deletion", { _uid: uid, _account_created_at: createdAt, _reason: reason });
      check(error, "Löschantrag");
      return data ?? null;
    },
    async completeDeletion(uid, token, count) {
      const { data, error } = await db.rpc("complete_account_deletion_lease", { _uid: uid, _token: token, _booking_count: count });
      check(error, "Löschung abschließen");
      return data ?? null;
    },
    async failDeletion(uid, token, msg) {
      await db.rpc("fail_account_deletion_lease", { _uid: uid, _token: token, _error: msg });
    },
    async deletionStatus(uid) {
      const { data, error } = await db
        .from("account_deletions")
        .select("status, requested_at, completed_at")
        .eq("former_user_id", uid)
        .maybeSingle();
      check(error, "Löschstatus");
      return data ?? null;
    },
    async listResumableDeletions(nowIso, limit) {
      const { data, error } = await db
        .from("account_deletions")
        .select("former_user_id")
        .or(`status.in.(requested,failed),and(status.eq.processing,locked_until.lt.${nowIso})`)
        .lt("attempts", 20)
        .order("requested_at", { ascending: true })
        .limit(limit);
      check(error, "Löschanträge lesen");
      return (data ?? []).map((r: { former_user_id: string }) => r.former_user_id);
    },
    async listUserFiles(uid) {
      const { data, error } = await admin.storage.from(USER_BUCKET).list(uid, { limit: 1000 });
      check(error, "Dateien auflisten");
      return (data ?? []).map((f: { name: string }) => `${uid}/${f.name}`);
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
      const { error } = await admin.auth.admin.deleteUser(uid, false);
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
    async markPurged(id) {
      const { error } = await db
        .from("document_archive")
        .update({ purged_at: new Date().toISOString(), storage_path: null })
        .eq("id", id);
      check(error, "Archiv markieren");
    },
  };
}
