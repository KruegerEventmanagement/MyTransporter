import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/notify-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        const expected = process.env.NOTIFY_HOOK_TOKEN;
        if (!expected || !token || token !== expected) {
          return new Response("forbidden", { status: 403 });
        }

        let payload: {
          type?: string;
          title?: string;
          body?: string;
          booking_id?: string | null;
          user_id?: string | null;
          notification_id?: string | null;
        } = {};
        try {
          payload = await request.json();
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const type = payload.type ?? "info";
        const { pushToAdmins } = await import("@/lib/push.functions");

        let title = payload.title || "MyTransporter";
        let body = payload.body || "";
        let targetUrl = "/admin";
        let tag = `mt-${type}-${payload.notification_id ?? Date.now()}`;

        if (type === "booking_created") {
          title = "🚨 Neue Buchung!";
          targetUrl = payload.booking_id ? `/admin?booking=${payload.booking_id}` : "/admin";
          tag = `booking-${payload.booking_id ?? payload.notification_id ?? Date.now()}`;
        } else if (type === "user_registered") {
          title = "👤 Neue Registrierung";
          targetUrl = "/admin?tab=customers";
          tag = `signup-${payload.user_id ?? payload.notification_id ?? Date.now()}`;
        }

        const result = await pushToAdmins({ title, body, url: targetUrl, tag });

        // Bei Buchung: zweiter Push nach kurzem Delay als „aggressiver" Reminder
        if (type === "booking_created") {
          setTimeout(() => {
            pushToAdmins({
              title: "🚨 Buchung wartet auf dich!",
              body,
              url: targetUrl,
              tag: `${tag}-reminder`,
            }).catch(() => {});
          }, 15000);
        }

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
