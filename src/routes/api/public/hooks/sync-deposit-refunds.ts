import { createFileRoute } from "@tanstack/react-router";

/**
 * Read-only-Fallback: gleicht offene Kautions-/Storno-Erstattungen mit Stripe ab.
 * Löst NIE neue Erstattungen aus. Zugriff nur mit NOTIFY_HOOK_TOKEN; liefert Zähler.
 */
export const Route = createFileRoute("/api/public/hooks/sync-deposit-refunds")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.NOTIFY_HOOK_TOKEN;
        const provided = request.headers.get("x-hook-token") ?? new URL(request.url).searchParams.get("token") ?? "";
        if (!token || provided !== token) return new Response("Unauthorized", { status: 401 });
        try {
          const { syncOpenSettlements } = await import("@/lib/deposit-settlement.server");
          const { productionDeps } = await import("@/lib/deposit-settlement-deps.server");
          return Response.json({ ok: true, ...(await syncOpenSettlements(productionDeps(), 25)) });
        } catch (e) {
          console.error("sync-deposit-refunds failed", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
