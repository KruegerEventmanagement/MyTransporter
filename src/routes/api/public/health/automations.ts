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

        const [
          paidBookings,
          newBookings,
          confirmations,
          adminMails,
          failures,
          conflicts,
          stuckActions,
        ] = await Promise.all([
          (async () => {
            const { count } = await supabaseAdmin
              .from("bookings")
              .select("id", { count: "exact", head: true })
              .eq("status", "paid")
              .gte("created_at", since);
            return count ?? 0;
          })(),
          countByTitle("Neue Buchung"),
          countByTitle("Buchungsbestätigung versendet"),
          countByTitle("Admin-Buchungsmail versendet"),
          countByTypes(["email_failed", "invoice_failed"]),
          countByTypes(["booking_conflict"]),
          (async () => {
            // Nur aktuelle Hänger zählen: fehlgeschlagene Aktionen im Fenster
            // sowie Locks, die deutlich zu lange laufen. Kurzzeitig laufende
            // oder alte historische Zeilen machen den Check nicht "unhealthy".
            const staleLock = new Date(Date.now() - 15 * 60_000).toISOString();
            const [failed, stale] = await Promise.all([
              supabaseAdmin
                .from("booking_actions")
                .select("id", { count: "exact", head: true })
                .eq("status", "failed")
                .gte("created_at", since),
              supabaseAdmin
                .from("booking_actions")
                .select("id", { count: "exact", head: true })
                .eq("status", "processing")
                .lt("locked_at", staleLock),
            ]);
            return (failed.count ?? 0) + (stale.count ?? 0);
          })(),
        ]);

        // Rechnungs-PDF-Rendering (inkl. Logo) verifizieren, ohne E-Mail zu senden
        let invoiceRender: "ok" | "skipped" | string = "skipped";
        let invoiceLogo: "ok" | "missing" | "skipped" = "skipped";
        try {
          const { data: bk } = await supabaseAdmin
            .from("bookings")
            .select("id")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (bk?.id) {
            const { generateBookingInvoicePdf } = await import("@/lib/invoice-pdf.server");
            const pdf = await generateBookingInvoicePdf(bk.id, { archive: false });
            invoiceRender = pdf.pdfBase64.length > 1000 ? "ok" : "too_small";
            // Logo im Rechnungskopf: eingebettetes Bild muss im PDF vorhanden sein.
            const bin = atob(pdf.pdfBase64.slice(0, 400_000));
            invoiceLogo = bin.includes("/Image") ? "ok" : "missing";
          }
        } catch (e) {
          invoiceRender = `error: ${String((e as Error)?.message ?? e).slice(0, 200)}`;
        }

        const healthy =
          failures === 0 &&
          stuckActions === 0 &&
          confirmations >= Math.min(paidBookings, newBookings) &&
          adminMails >= Math.min(paidBookings, newBookings) &&
          invoiceRender !== "too_small" &&
          invoiceLogo !== "missing" &&
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
          openActions: stuckActions,
          invoices: await countByTitle("Rechnung versendet"),
          invoiceRender,
          invoiceLogo,
          checkedAt: new Date().toISOString(),
        });
      },
    },
  },
});
