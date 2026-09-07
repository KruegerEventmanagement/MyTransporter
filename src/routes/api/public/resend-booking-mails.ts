import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/resend-booking-mails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        const bookingId = url.searchParams.get("bookingId");
        const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!token || !expected || token !== expected) {
          return new Response("forbidden", { status: 403 });
        }
        if (!bookingId) return new Response("missing bookingId", { status: 400 });

        const force = url.searchParams.get("force") === "1";
        const { sendBookingConfirmationImpl, sendAdminBookingNotificationImpl } = await import(
          "@/lib/booking-emails.server"
        );
        const [customer, admin] = await Promise.allSettled([
          sendBookingConfirmationImpl({ bookingId, force }),
          sendAdminBookingNotificationImpl({ bookingId, force }),
        ]);
        return new Response(JSON.stringify({ customer, admin }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
