import { createFileRoute } from "@tanstack/react-router";

import { berlinDateParts } from "@/lib/birthday";

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
        // Wie beim bestehenden Erinnerungsjob: der Aufruf ist unschädlich, weil
        // der Versand pro Nutzer und Kalenderjahr datenbankseitig genau einmal
        // erfolgt. Die Antwort enthält nur Zähler, keine Kundendaten.
        // Ein optionales Token wird zusätzlich akzeptiert.
        const token = process.env.NOTIFY_HOOK_TOKEN;
        const provided =
          new URL(request.url).searchParams.get("token") ??
          request.headers.get("x-hook-token") ??
          "";
        if (token && provided && provided !== token) {
          return new Response("Unauthorized", { status: 401 });
        }

        const now = new Date();
        const { hour, iso } = berlinDateParts(now);
        const force = new URL(request.url).searchParams.get("force") === "1";
        if (hour < 9 && !force) {
          return Response.json({ skipped: "before_send_window", date: iso, hour });
        }

        try {
          const { processBirthdayEmails } = await import("@/lib/birthday.server");
          const result = await processBirthdayEmails(now);
          return Response.json(result);
        } catch (e) {
          console.error("birthday job failed", String((e as Error)?.message ?? e));
          return Response.json({ error: "birthday_job_failed" }, { status: 500 });
        }
      },
    },
  },
});
