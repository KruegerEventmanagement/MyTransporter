import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAccount } from "@/lib/active-account";

export type DeletedCustomerInfo = {
  deleted: boolean;
  deletedAt: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  docs: { id: string; doc_type: string; url: string; retention_until: string }[];
};

/** Admin-only: Kontakt + archivierte Dokumente eines vom Kunden gelöschten Kontos. */
export const getDeletedCustomerInfo = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<DeletedCustomerInfo> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const sb = context.supabase;
    const [del, snap, inv, arch] = await Promise.all([
      sb.from("account_deletions").select("status, completed_at, requested_at").eq("former_user_id", data.userId).order("requested_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("deleted_customer_contacts").select("*").eq("former_user_id", data.userId).maybeSingle(),
      sb.from("issued_documents").select("customer_name, customer_email, snapshot").eq("user_id", data.userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("document_archive").select("id, doc_type, storage_path, retention_until").eq("user_id", data.userId).is("purged_at", null),
    ]);
    const s = snap.data;
    const invSnap = (inv.data?.snapshot ?? {}) as Record<string, unknown>;
    const invPhone = typeof invSnap.customer_phone === "string" ? invSnap.customer_phone : null;
    const name = [s?.first_name, s?.last_name].filter(Boolean).join(" ").trim() || inv.data?.customer_name?.replace(/\s+/g, " ").trim() || null;
    const docs: DeletedCustomerInfo["docs"] = [];
    const rows = (arch.data ?? []).filter((r) => r.storage_path);
    if (rows.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (const r of rows) {
        const { data: signed } = await supabaseAdmin.storage.from("document-archive").createSignedUrl(r.storage_path!, 600);
        if (signed?.signedUrl) docs.push({ id: r.id, doc_type: r.doc_type, url: signed.signedUrl, retention_until: r.retention_until });
      }
    }
    return {
      deleted: !!del.data,
      deletedAt: del.data?.completed_at ?? del.data?.requested_at ?? null,
      name,
      email: s?.email ?? inv.data?.customer_email ?? null,
      phone: s?.phone ?? invPhone,
      docs,
    };
  });
