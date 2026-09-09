import { createFileRoute } from "@tanstack/react-router";

/**
 * Manueller, sicherer Reconcile-Endpunkt für eine bezahlte Buchung.
 *
 * Nutzt die Action-State-Machine (public.booking_actions): holt nur fehlende
 * bzw. fehlgeschlagene Folgeaktionen nach. Es gibt bewusst KEIN blindes
 * `force`, das erfolgreich versendete Mails erneut sendet.
 *
 * Optional `actions=admin_booking_email,customer_confirmation_invoice`, um
 * gezielt einzelne Aktionen nachzuziehen.
 */
export const Route = createFileRoute("/api/public/resend-booking-mails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? request.headers.get("x-hook-token") ?? "";
        const expected = process.env.NOTIFY_HOOK_TOKEN;
        if (!expected || token !== expected) {
          return new Response("forbidden", { status: 403 });
        }
        const bookingId = url.searchParams.get("bookingId");
        if (!bookingId) return new Response("missing bookingId", { status: 400 });

        const { reconcileBookingPostActions, BOOKING_ACTION_KEYS } =
          await import("@/lib/booking-actions.server");
        const requested = (url.searchParams.get("actions") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is (typeof BOOKING_ACTION_KEYS)[number] =>
            (BOOKING_ACTION_KEYS as readonly string[]).includes(s),
          );

        const result = await reconcileBookingPostActions(
          bookingId,
          requested.length > 0 ? requested : undefined,
        );

        return Response.json(result, { status: result.hasFailures ? 500 : 200 });
      },
    },
  },
});
