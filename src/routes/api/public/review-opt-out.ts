import { createFileRoute } from "@tanstack/react-router";

/**
 * Widerspruch gegen Bewertungsanfragen. GET zeigt nur eine Bestätigungsseite
 * (Link-Vorschauen lösen nichts aus); erst POST trägt den Widerspruch ein.
 * Der Token ist zufällig je Mail und verrät keine Daten.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>MyTransporter</title></head><body style="font-family:system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 16px;color:#111">${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/review-opt-out")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const t = new URL(request.url).searchParams.get("t") ?? "";
        if (!UUID.test(t)) return page("<p>Dieser Link ist ungültig.</p>", 400);
        return page(
          `<h1 style="font-size:20px">Keine Bewertungsanfragen mehr?</h1><p>Wir senden dir dann keine Bitte um eine Bewertung mehr. Rechnungen und Buchungsinfos erhältst du weiterhin.</p><form method="post"><input type="hidden" name="t" value="${t}"><button style="background:#000;color:#fff;border:0;border-radius:999px;padding:12px 24px;font-size:15px">Abmelden</button></form>`,
        );
      },
      POST: async ({ request }) => {
        const form = await request.formData().catch(() => null);
        const t = String(form?.get("t") ?? "");
        if (!UUID.test(t)) return page("<p>Dieser Link ist ungültig.</p>", 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("customer_mail_outbox").select("id, recipient_email").eq("opt_out_token", t).maybeSingle();
        if (!row?.recipient_email) return page("<p>Dieser Link ist ungültig oder abgelaufen.</p>", 404);
        await supabaseAdmin.from("email_opt_outs").upsert(
          { email_lower: row.recipient_email.trim().toLowerCase(), scope: "review_request" },
          { onConflict: "email_lower,scope", ignoreDuplicates: true },
        );
        await supabaseAdmin.from("customer_mail_outbox")
          .update({ status: "cancelled", blocked_reason: "Empfänger hat widersprochen" } as never)
          .eq("kind", "review_request").eq("recipient_email", row.recipient_email).in("status", ["scheduled", "failed"]);
        return page("<h1 style=\"font-size:20px\">Erledigt</h1><p>Du erhältst keine Bewertungsanfragen mehr von MyTransporter.</p>");
      },
    },
  },
});
