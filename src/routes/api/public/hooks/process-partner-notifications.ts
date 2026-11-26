import { createFileRoute } from "@tanstack/react-router";

/** Versand-/Wiederholungslauf der internen Partner-Mails. Nur mit NOTIFY_HOOK_TOKEN; liefert nur Zähler. */
export const Route = createFileRoute("/api/public/hooks/process-partner-notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["NOTIFY_HOOK_TOKEN"];
        if (!token || (request.headers.get("x-hook-token") ?? "") !== token) return new Response("Unauthorized", { status: 401 });
        try {
          const { runPartnerNotifications } = await import("@/lib/partner-notifications.server");
          return Response.json({ ok: true, ...(await runPartnerNotifications({ limit: 20 })) });
        } catch (e) {
          console.error("process-partner-notifications failed", String((e as Error)?.message ?? e).slice(0, 200));
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
