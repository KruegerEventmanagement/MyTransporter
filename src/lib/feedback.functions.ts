import { createServerFn } from "@tanstack/react-start";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 2000) : "");

async function rowFor(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("customer_mail_outbox")
    .select("id, source_type, source_id").eq("opt_out_token", token).eq("kind", "feedback_request").eq("status", "sent").maybeSingle();
  if (error) throw new Error("Gerade nicht erreichbar");
  return { db: supabaseAdmin, row: data };
}

/** Öffentlich, aber nur mit dem zufälligen Token aus der eigenen Feedback-Mail. Gibt keine Personendaten zurück. */
export const getFeedbackState = createServerFn({ method: "POST" })
  .inputValidator((d: { t: string }) => ({ t: String(d?.t ?? "") }))
  .handler(async ({ data }) => {
    if (!UUID.test(data.t)) return { valid: false, submitted: false };
    const { db, row } = await rowFor(data.t);
    if (!row) return { valid: false, submitted: false };
    const { data: fb } = await db.from("customer_feedback").select("id").eq("outbox_id", row.id).maybeSingle();
    return { valid: true, submitted: !!fb };
  });

export const submitFeedback = createServerFn({ method: "POST" })
  .inputValidator((d: { t: string; liked?: string; disliked?: string; ideas?: string }) => ({
    t: String(d?.t ?? ""), liked: clip(d?.liked), disliked: clip(d?.disliked), ideas: clip(d?.ideas),
  }))
  .handler(async ({ data }) => {
    if (!UUID.test(data.t)) return { ok: false, error: "Ungültiger Link" };
    if (!data.liked && !data.disliked && !data.ideas) return { ok: false, error: "Bitte mindestens ein Feld ausfüllen." };
    const { db, row } = await rowFor(data.t);
    if (!row) return { ok: false, error: "Dieser Link ist ungültig oder abgelaufen." };
    const { error } = await db.from("customer_feedback").insert({
      outbox_id: row.id, source_type: row.source_type, source_id: row.source_id,
      liked: data.liked || null, disliked: data.disliked || null, ideas: data.ideas || null,
    } as never);
    if (error && error.code !== "23505") return { ok: false, error: "Speichern fehlgeschlagen. Bitte später erneut versuchen." };
    if (!error) {
      await db.from("admin_notifications").insert({
        type: "customer_feedback", title: "Neues Kundenfeedback",
        body: [data.liked && `Gut: ${data.liked}`, data.disliked && `Schlecht: ${data.disliked}`, data.ideas && `Ideen: ${data.ideas}`].filter(Boolean).join(" · ").slice(0, 900),
        booking_id: row.source_type === "booking" ? row.source_id : null,
      });
    }
    return { ok: true };
  });
