import { createFileRoute } from "@tanstack/react-router";

/**
 * Geplante Wiederholung der Owner-Benachrichtigungen für manuelle Termine.
 *
 * Wird zusätzlich zum bestehenden 15-Minuten-Zeitplan (send-reminders) als
 * gezielter Auslöser bereitgestellt. Zugriff nur mit dem bereits vorhandenen
 * NOTIFY_HOOK_TOKEN. Liefert ausschließlich Zähler – keine Kundendaten.
 */
export const Route = createFileRoute("/api/public/hooks/process-manual-notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.NOTIFY_HOOK_TOKEN;
        const provided =
          new URL(request.url).searchParams.get("token") ??
          request.headers.get("x-hook-token") ??
          "";
        if (!token || provided !== token) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { processManualNotificationOutbox } = await import(
            "@/lib/manual-notifications.server"
          );
          const result = await processManualNotificationOutbox({ limit: 25 });
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("process-manual-notifications failed", e);
          return Response.json({ ok: false, error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
