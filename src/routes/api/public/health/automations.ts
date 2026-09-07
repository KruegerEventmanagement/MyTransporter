import { createFileRoute } from "@tanstack/react-router";

/**
 * Health-Check der automatischen Folgeschritte nach einer Zahlung.
 *
 * Liefert nur Zähler und Zeitstempel – keine Kundendaten, keine Secrets.
 * Zugriff nur mit dem bereits vorhandenen NOTIFY_HOOK_TOKEN.
 */
export const Route = createFileRoute("/api/public/health/automations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = process.env.NOTIFY_HOOK_TOKEN;
        const provided =
          new URL(request.url).searchParams.get("token") ??
          request.headers.get("x-hook-token") ??
          "";
        if (!token || provided !== token) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const since = new Date(Date.now() - 24 * 3600_000).toISOString();

        const countByTitle = async (title: string) => {
          const { count } = await supabaseAdmin
            .from("admin_notifications")
            .select("id", { count: "exact", head: true })
            .eq("title", title)
            .gte("created_at", since);
          return count ?? 0;
        };
        const countByTypes = async (types: string[]) => {
          const { count } = await supabaseAdmin
            .from("admin_notifications")
            .select("id", { count: "exact", head: true })
            .in("type", types)
            .gte("created_at", since);
          return count ?? 0;
        };

        const [paidBookings, newBookings, confirmations, adminMails, failures, conflicts] =
          await Promise.all([
            (async () => {
              const { count } = await supabaseAdmin
                .from("bookings")
                .select("id", { count: "exact", head: true })
                .eq("status", "paid")
                .gte("created_at", since);
              return count ?? 0;
            })(),
            countByTitle("Neue Buchung"),
            countByTitle("Buchungsbestaetigung versendet"),
            countByTitle("Admin-Buchungsmail versendet"),
            countByTypes(["email_failed", "invoice_failed"]),
            countByTypes(["booking_conflict"]),
          ]);

        // Rechnungs-PDF-Rendering (inkl. Logo) verifizieren, ohne E-Mail zu senden
        let invoiceRender: "ok" | "skipped" | string = "skipped";
        try {
          const { data: bk } = await supabaseAdmin
            .from("bookings")
            .select("id")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (bk?.id) {
            const { generateBookingInvoicePdf } = await import("@/lib/invoice-pdf.server");
            const pdf = await generateBookingInvoicePdf(bk.id);
            invoiceRender = pdf.pdfBase64.length > 1000 ? "ok" : "too_small";
          }
        } catch (e) {
          invoiceRender = `error: ${String((e as Error)?.message ?? e).slice(0, 200)}`;
        }

        const healthy =
          failures === 0 &&
          confirmations >= Math.min(paidBookings, newBookings) &&
          adminMails >= Math.min(paidBookings, newBookings) &&
          invoiceRender !== "too_small" &&
          !String(invoiceRender).startsWith("error");

        return Response.json({
          window: "24h",
          healthy,
          paidBookings,
          newBookings,
          confirmations,
          adminMails,
          failures,
          conflicts,
          invoiceRender,
          checkedAt: new Date().toISOString(),
        });
      },
    },
  },
});
