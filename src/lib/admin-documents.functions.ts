import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { docInputSchema, sendDocSchema } from "@/lib/admin-documents-schema";

export const renderAdminDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => docInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Nicht berechtigt");
    const { generateCustomDocumentPdf } = await import("@/lib/custom-document-pdf.server");
    return await generateCustomDocumentPdf(data);
  });

export const sendAdminDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sendDocSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Nicht berechtigt");

    const { generateCustomDocumentPdf } = await import("@/lib/custom-document-pdf.server");
    const { pdfBase64, filename } = await generateCustomDocumentPdf(data.doc);

    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) throw new Error("E-Mail-Versand ist nicht konfiguriert");

    const { renderEmail, esc } = await import("@/lib/email-template");
    const html = renderEmail({
      heading: data.subject,
      extraHtml: `<p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;">${esc(
        data.message,
      ).replace(/\n/g, "<br/>")}</p>`,
      outro: ["Das zugehörige Dokument findest du im Anhang dieser E-Mail."],
    });


    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "MyTransporter <info@mytransporter.org>",
        to: data.to,
        subject: data.subject,
        html,
        attachments: [{ filename, content: pdfBase64 }],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Resend failed [${res.status}]: ${text}`);
      throw new Error(`E-Mail konnte nicht gesendet werden (${res.status})`);
    }
    return { ok: true, filename };
  });
