import { createServerFn } from "@tanstack/react-start";
import { requireActiveAccount } from "@/lib/active-account";
import {
  docInputSchema,
  docIdSchema,
  listDocsSchema,
  sendDocSchema,
  type DocInputData,
} from "@/lib/admin-documents-schema";


async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Nicht berechtigt");
}

/** Erzeugt das PDF und legt es revisionssicher im Belegarchiv ab. */
async function renderAndArchive(doc: DocInputData, adminId: string) {
  const { generateCustomDocumentPdf } = await import("@/lib/custom-document-pdf.server");
  const { computeDocTotals, VAT_RATE } = await import("@/lib/doc-totals");
  const { archiveIssuedDocument } = await import("@/lib/document-archive.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let userId: string | null = null;
  const bookingId = doc.bookingId ? doc.bookingId : null;
  if (bookingId) {
    const { data: bk } = await supabaseAdmin.from("bookings").select("id, user_id").eq("id", bookingId).maybeSingle();
    if (!bk) throw new Error("Buchungs-ID nicht gefunden");
    userId = bk.user_id;
  }

  const pdf = await generateCustomDocumentPdf(doc);
  const t = computeDocTotals(doc.items);
  const items = t.rows.map((r) => ({
    label: r.label,
    net_cents: r.netC,
    vat_cents: r.vatC,
    gross_cents: r.grossC,
    vat_rate: r.netC == null ? null : VAT_RATE,
  }));
  const archive = await archiveIssuedDocument({
    kind: doc.kind,
    source: "manual",
    documentNumber: doc.number,
    documentDate: doc.date,
    bookingId,
    userId,
    customerName: doc.recipient.attention || null,
    customerCompany: doc.recipient.company || null,
    customerEmail: doc.recipient.email || null,
    billingAddress: {
      street: doc.recipient.street ?? null,
      city: doc.recipient.city ?? null,
      vat_id: doc.recipient.vatId ?? null,
    },
    items,
    netCents: t.vatNetC,
    vatRate: VAT_RATE,
    vatCents: t.vatVatC,
    grossCents: t.vatGrossC,
    nonTaxableCents: t.plainC,
    totalCents: t.totalC,
    paymentStatus: doc.kind === "invoice" ? "open" : null,
    snapshot: { input: doc, totals: t },
    pdfBase64: pdf.pdfBase64,
    filename: pdf.filename,
    createdBy: adminId,
  });
  return { ...pdf, archiveId: archive.id, revision: archive.revision };
}

export const renderAdminDocument = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((data: unknown) => docInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return await renderAndArchive(data, context.userId);
  });

export const sendAdminDocument = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((data: unknown) => sendDocSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) throw new Error("E-Mail-Versand ist nicht konfiguriert");

    const { pdfBase64, filename } = await renderAndArchive(data.doc, context.userId);

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

/** Belegarchiv: Liste für Admins (RLS: nur Admin sieht alle). */
export const listIssuedDocuments = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((data: unknown) => listDocsSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("issued_documents")
      .select(
        "id, kind, source, document_number, revision, document_date, created_at, booking_id, customer_name, customer_company, customer_email, net_cents, vat_cents, vat_rate, gross_cents, non_taxable_cents, total_cents, payment_status, pdf_filename",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.kind !== "all") q = q.eq("kind", data.kind);
    const term = data.q.replace(/[%,()*]/g, " ").trim();
    if (term) {
      const like = `%${term}%`;
      const ors = [
        `document_number.ilike.${like}`,
        `customer_name.ilike.${like}`,
        `customer_company.ilike.${like}`,
        `customer_email.ilike.${like}`,
      ];
      if (/^[0-9a-f-]{36}$/i.test(term)) ors.push(`booking_id.eq.${term}`);
      q = q.or(ors.join(","));
    }
    const { data: rows, error } = await q;
    if (error) throw new Error("Belege konnten nicht geladen werden");
    return rows ?? [];
  });

/** Einzelbeleg inkl. Snapshot + kurzlebigem signierten PDF-Link. */
export const getIssuedDocument = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((data: unknown) => docIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("issued_documents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Beleg nicht gefunden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ISSUED_DOCUMENTS_BUCKET } = await import("@/lib/document-archive.server");
    const { data: signed } = await supabaseAdmin.storage
      .from(ISSUED_DOCUMENTS_BUCKET)
      .createSignedUrl(row.pdf_path, 120, { download: row.pdf_filename });
    return { doc: row, pdfUrl: signed?.signedUrl ?? null };
  });
