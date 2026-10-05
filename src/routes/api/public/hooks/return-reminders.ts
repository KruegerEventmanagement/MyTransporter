import { createFileRoute } from "@tanstack/react-router";

/**
 * 10-Minuten-Rückgabeerinnerung per Web-Push (nur Kunden mit freiwilligem Abo).
 * Getrennt vom Mail-Erinnerungs-Cron; Zugriff nur mit NOTIFY_HOOK_TOKEN.
 * Antwort enthält ausschließlich Zähler.
 */
export const Route = createFileRoute("/api/public/hooks/return-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.NOTIFY_HOOK_TOKEN;
        const provided =
          new URL(request.url).searchParams.get("token") ?? request.headers.get("x-hook-token") ?? "";
        if (!token || provided !== token) return new Response("Unauthorized", { status: 401 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { pushToUser } = await import("@/lib/customer-push.server");
          const { processReturnReminders } = await import("@/lib/return-reminder");
          const { formatBerlin } = await import("@/lib/trip-time");
          const r = await processReturnReminders({
            client: supabaseAdmin,
            push: pushToUser,
            now: () => Date.now(),
            formatEnd: formatBerlin,
          });
          return Response.json({ ok: true, ...r });
        } catch (e) {
          console.error("return-reminders failed", e instanceof Error ? e.message : "unknown");
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
