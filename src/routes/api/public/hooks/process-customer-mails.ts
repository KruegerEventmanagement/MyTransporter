import { createFileRoute } from "@tanstack/react-router";

/** Prepared five-minute sweep; schedule stays inactive until release. */
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
          // Bounce-Erkennung unabhängig vom Versand: Fehler hier stoppen den Sweep nie.
          let bounces: unknown = null;
          try {
            const { scanMailBounces } = await import("@/lib/mail-bounce.server");
            bounces = await scanMailBounces();
          } catch (e) {
            console.error("bounce scan failed", String((e as Error)?.message ?? e).slice(0, 200));
            bounces = { error: true };
          }
          return Response.json({ ok: true, ...stats, bounces });
        } catch (e) {
          console.error("process-customer-mails failed", String((e as Error)?.message ?? e).slice(0, 300));
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
