import { createFileRoute } from "@tanstack/react-router";

/**
 * Geplante Wiederholung der Google-Kalender-Übertragung.
 *
 * Zugriff nur mit dem bereits vorhandenen NOTIFY_HOOK_TOKEN. Liefert
 * ausschließlich Zähler und Statusangaben – keine Kunden- oder Zugangsdaten.
 */
export const Route = createFileRoute("/api/public/hooks/process-calendar-sync")({
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

        const { processCalendarSync, calendarCredentialsPresent } = await import(
          "@/lib/calendar-sync.server"
        );
        if (!calendarCredentialsPresent()) {
          return Response.json(
            { ok: false, connected: false, error: "Google-Kalender ist nicht verbunden" },
            { status: 503 },
          );
        }
        try {
          const result = await processCalendarSync({ limit: 25 });
          return Response.json({ ok: true, connected: true, ...result });
        } catch (e) {
          console.error("process-calendar-sync failed", e);
          return Response.json({ ok: false, connected: true, error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
