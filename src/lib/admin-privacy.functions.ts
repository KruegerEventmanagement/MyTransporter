import { createServerFn } from "@tanstack/react-start";
import { requireActiveAccount } from "@/lib/active-account";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || data !== true) throw new Error("Nicht berechtigt");
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Kontolöschungen + Dokumentarchiv (nur Admin, per RLS gelesen). */
export const listPrivacyRecords = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/** Kurzlebiger Link auf eine Archivkopie – nur Admin, nur innerhalb der Aufbewahrung/eines Prüfvermerks. */
export const getArchivedDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: { id: string }) => {
    if (!UUID.test(String(d?.id))) throw new Error("Ungültig");
    return { id: d.id };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = await (context.supabase as any)
      .from("document_archive")
      .select("storage_path, purged_at, retention_until, legal_hold_until")
      .eq("id", data.id)
      .maybeSingle();
    const { isArchiveViewable } = await import("@/lib/privacy-ops.server");
    if (!row || !isArchiveViewable(row, Date.now())) return { url: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ARCHIVE_BUCKET } = await import("@/lib/privacy-store.server");
    const { data: s } = await supabaseAdmin.storage.from(ARCHIVE_BUCKET).createSignedUrl(row.storage_path, 60);
    return { url: s?.signedUrl ?? null };
  });

/** Begründeter, befristeter Prüfvermerk (max. 180 Tage, DB-Trigger erzwingt Grenzen). */
export const setArchiveReviewHold = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: { id: string; days: number; reason: string }) => {
    const days = Math.floor(Number(d?.days));
    const reason = String(d?.reason ?? "").trim();
    if (!UUID.test(String(d?.id)) || !(days >= 1 && days <= 180) || reason.length < 10 || reason.length > 300) {
      throw new Error("Ungültig");
    }
    return { id: d.id, days, reason };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const until = new Date(Date.now() + data.days * 86_400_000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("document_archive")
      .update({ legal_hold_until: until, legal_hold_reason: data.reason })
      .eq("id", data.id)
      .is("purged_at", null)
      .select("id");
    if (error || !rows?.length) return { ok: false as const, reason: "Prüfvermerk konnte nicht gesetzt werden." };
    return { ok: true as const, until };
  });

/** Admin-Retry nur für bereits bestehende, vom Kunden bestätigte Löschanträge. */
export const retryAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: { id: string }) => {
    if (!UUID.test(String(d?.id))) throw new Error("Ungültig");
    return { id: d.id };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = await (context.supabase as any)
      .from("account_deletions")
      .select("former_user_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: false as const, reason: "Antrag nicht gefunden." };
    if (row.status === "completed") return { ok: true as const, status: "completed" };
    const { createPrivacyStore } = await import("@/lib/privacy-store.server");
    const { runAccountDeletion } = await import("@/lib/privacy-ops.server");
    const store = await createPrivacyStore();
    const r = await runAccountDeletion(store, {
      uid: row.former_user_id,
      accountCreatedAt: null,
      bookings: await store.listBookings(row.former_user_id),
      nowMs: Date.now(),
      create: false,
    });
    if (r.ok) return { ok: true as const, status: "completed" };
    const reasons: Record<string, string> = {
      blocked: "Miete läuft noch – Löschung erfolgt nach Mietende automatisch.",
      busy: "Löschung läuft gerade.",
      admin: "Admin-Konten werden nicht gelöscht.",
      not_requested: "Kein bestätigter Antrag.",
      failed: "Schritt fehlgeschlagen, erneuter Versuch möglich.",
    };
    return { ok: false as const, reason: reasons[r.kind] ?? "Nicht möglich." };
  });
