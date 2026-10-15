import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAccount } from "@/lib/active-account";
import { validateGoogleReviewUrl, GOOGLE_REVIEW_URL } from "@/lib/customer-mail-outbox";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Nicht berechtigt");
}

const COLS =
  "id, source_type, source_id, kind, status, due_at, recipient_email, attempts, ambiguous, error_kind, last_error, blocked_reason, provider_message_id, first_attempt_at, next_attempt_at, sent_at, created_at";

export const listCustomerMails = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: unknown) => z.object({ sourceId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase.from("customer_mail_outbox").select(COLS).order("created_at", { ascending: false }).limit(100);
    if (data.sourceId) q = q.eq("source_id", data.sourceId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const { data: settings } = await context.supabase
      .from("customer_mail_settings").select("google_review_url, review_requests_from, invoice_outbox_from").eq("id", true).maybeSingle();
    return { rows: rows ?? [], settings: settings ?? null };
  });

export const saveReviewLink = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: unknown) => z.object({ url: z.string().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const trimmed = data.url.trim();
    const url = validateGoogleReviewUrl(trimmed || GOOGLE_REVIEW_URL);
    if (!url) {
      throw new Error("Bitte den direkten Bewertungslink aus deinem Google-Unternehmensprofil einfügen (g.page/r/…, search.google.com/local/writereview?placeid=… oder maps.app.goo.gl/…).");
    }
    const { data: cur } = await context.supabase.from("customer_mail_settings").select("review_requests_from").eq("id", true).maybeSingle();
    const { error } = await context.supabase.from("customer_mail_settings").update({
      google_review_url: url,
      // Start erst ab jetzt – nie rückwirkend für ältere Buchungen.
      review_requests_from: cur?.review_requests_from ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    }).eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true, url };
  });

export const retryCustomerMail = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase.from("customer_mail_outbox").select("id, status, ambiguous").eq("id", data.id).maybeSingle();
    if (error || !row) throw new Error("Eintrag nicht gefunden");
    if (row.status === "sent") throw new Error("Bereits vom Mailanbieter angenommen – kein erneuter Versand.");
    // Unklare Ergebnisse dürfen nicht per Knopf neu gesendet werden (Gefahr Doppelversand).
    if (row.status !== "failed" || row.ambiguous) {
      throw new Error("Ergebnis unklar/Prüfung nötig – kein erneuter Versand per Knopf. Bitte beim Mailanbieter klären.");
    }
    const { error: rErr } = await context.supabase.rpc("release_customer_mail_for_retry", { _id: data.id });
    if (rErr) throw new Error(rErr.message);
    const { processOutboxRowById } = await import("@/lib/customer-mail-outbox.server");
    return await processOutboxRowById(data.id);
  });
