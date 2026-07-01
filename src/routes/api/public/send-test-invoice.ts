import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/send-test-invoice")({
  server: {
    handlers: {
      POST: async () => {
        // Fest verdrahtet: nur an den Betreiber, Design-Vorschau
        const to = "krueger.christian96@gmx.de";
        const bookingId: string | null = null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { generateBookingInvoicePdf } = await import("@/lib/invoice-pdf.server");

        let useId = bookingId;
        if (!useId) {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("email", to)
            .maybeSingle();
          if (!prof) return new Response("no profile", { status: 404 });
          const { data: bk } = await supabaseAdmin
            .from("bookings")
            .select("id")
            .eq("user_id", prof.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!bk) return new Response("no booking", { status: 404 });
          useId = bk.id;
        }

        const { pdfBase64, invoiceNo, filename } = await generateBookingInvoicePdf(useId!);

        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) return new Response("resend key missing", { status: 500 });

        const html = `
          <div style="font-family:Arial,sans-serif;font-size:14px;color:#111;">
            <h2 style="margin:0 0 12px;">Probe-Rechnung MyTransporter</h2>
            <p>Hallo Christian,</p>
            <p>anbei die aktuelle <strong>Probe-Rechnung</strong> im neuen Design zur Ansicht.</p>
            <p>Rechnungsnummer: <strong>${invoiceNo}</strong></p>
            <p style="color:#666;font-size:12px;margin-top:24px;">Diese E-Mail dient ausschließlich zur Designvorschau. Es wurde keine neue Buchung angelegt.</p>
          </div>`;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "MyTransporter <info@mytransporter.org>",
            to,
            subject: `Probe-Rechnung MyTransporter · ${invoiceNo}`,
            html,
            attachments: [{ filename, content: pdfBase64 }],
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          return new Response(JSON.stringify({ ok: false, status: res.status, error: errText }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, invoiceNo, to }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});