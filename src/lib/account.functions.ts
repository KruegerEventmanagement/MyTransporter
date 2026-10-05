import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Status, bei denen eine Kontolöschung blockiert ist (laufende/bevorstehende Miete). */
export const BLOCKING_STATUSES = [
  "paid",
  "confirmed",
  "active",
  "started",
  "running",
  "in_progress",
  "picked_up",
  "returning",
  "return_pending",
];

/**
 * Kontolöschung (App-Store-/Play-Anforderung). Löscht Konto, Profil, Dokumente
 * und Push-Registrierungen. Buchungen/Rechnungen bleiben wegen gesetzlicher
 * Aufbewahrungspflicht erhalten. Bei offener Miete wird abgelehnt.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { confirm: string }) => {
    if (d?.confirm !== "LÖSCHEN") throw new Error("Bestätigung fehlt");
    return d;
  })
  .handler(async ({ context }) => {
    const uid = context.userId;
    const today = new Date().toISOString().slice(0, 10);
    const { data: open, error: openErr } = await context.supabase
      .from("bookings")
      .select("id,status,start_date")
      .eq("user_id", uid)
      .in("status", BLOCKING_STATUSES);
    if (openErr) throw new Error("Buchungen konnten nicht geprüft werden.");
    const blocking = (open ?? []).filter(
      (b) => !["paid", "confirmed"].includes(String(b.status)) || String(b.start_date) >= today,
    );
    if (blocking.length > 0) {
      return { ok: false as const, reason: "Du hast noch eine laufende oder bevorstehende Miete. Bitte storniere sie oder schließe sie ab." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: files } = await supabaseAdmin.storage.from("user-documents").list(uid, { limit: 1000 });
    if (files && files.length) {
      await supabaseAdmin.storage.from("user-documents").remove(files.map((f) => `${uid}/${f.name}`));
    }
    await supabaseAdmin.from("push_subscriptions").delete().eq("user_id", uid);
    await supabaseAdmin.from("native_push_tokens").delete().eq("user_id", uid);
    await supabaseAdmin.from("profiles").delete().eq("id", uid);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (error) throw new Error("Konto konnte nicht gelöscht werden. Bitte kontaktiere uns.");
    return { ok: true as const };
  });
