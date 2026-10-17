import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/process-booking-emails")({
  server: { handlers: { POST: async ({ request }) => {
    const token = process.env.NOTIFY_HOOK_TOKEN;
    if (!token || request.headers.get("x-hook-token") !== token) return new Response("Unauthorized", { status: 401 });
    try {
      const { runBookingEmailRecovery } = await import("@/lib/booking-email-recovery.server");
      return Response.json({ ok: true, ...await runBookingEmailRecovery() });
    } catch {
      return Response.json({ ok: false }, { status: 500 });
    }
  } } },
});