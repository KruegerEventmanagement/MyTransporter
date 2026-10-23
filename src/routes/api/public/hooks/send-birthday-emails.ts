import { createFileRoute } from "@tanstack/react-router";


/**
 * Täglicher Geburtstagsversand.
 *
 * Der Job wird stündlich aufgerufen und versendet erst ab 09:00 Uhr
 * Europe/Berlin – dadurch ist die Uhrzeit sommer- wie winterzeitfest und
 * ein verpasster Lauf wird später am Tag automatisch nachgeholt. Der Versand
 * selbst ist über UNIQUE(user_id, year) pro Kalenderjahr idempotent.
 */
export const Route = createFileRoute("/api/public/hooks/send-birthday-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.NOTIFY_HOOK_TOKEN;
        if (!token || request.headers.get("x-hook-token") !== token) return new Response("Unauthorized", { status: 401 });
        try {
          const { processBirthdayEmails } = await import("@/lib/birthday.server");
          return Response.json(await processBirthdayEmails());
        } catch (e) {
          console.error("birthday hook failed", String((e as Error)?.message ?? e).slice(0, 200));
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
