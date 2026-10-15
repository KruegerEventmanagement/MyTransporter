import { createFileRoute } from "@tanstack/react-router";

/** Geschützter stündlicher Nachholer der Kunden-Mail-Outbox (Rechnung, Bewertungsanfrage). */
export const Route = createFileRoute("/api/public/hooks/process-customer-mails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.NOTIFY_HOOK_TOKEN;
        const provided = request.headers.get("x-hook-token") ?? "";
        if (!token || provided !== token) return new Response("Unauthorized", { status: 401 });
        try {
          const { runCustomerMailSweep } = await import("@/lib/customer-mail-outbox.server");
          const stats = await runCustomerMailSweep();
          return Response.json({ ok: true, ...stats });
        } catch (e) {
          console.error("process-customer-mails failed", String((e as Error)?.message ?? e).slice(0, 300));
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
