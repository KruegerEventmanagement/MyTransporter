import { createFileRoute } from "@tanstack/react-router";

/**
 * Read-only-Fallback: gleicht offene Kautions-/Storno-Erstattungen mit Stripe ab
 * und spiegelt alle Stripe-Refunds der letzten 35 Tage (auch Dashboard-Refunds,
 * verpasste Webhooks). Löst NIE neue Erstattungen aus. Zugriff nur mit NOTIFY_HOOK_TOKEN.
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
          const { reconcileRecentRefunds } = await import("@/lib/stripe-refund-sync.server");
          const { mirrorDeps } = await import("@/lib/stripe-refund-sync-deps.server");
          const envs = (["live", "sandbox"] as const).filter((e) => !!process.env[e === "live" ? "STRIPE_LIVE_API_KEY" : "STRIPE_SANDBOX_API_KEY"]);
          const since = Math.floor(Date.now() / 1000) - 35 * 86400;
          const refunds = await reconcileRecentRefunds(mirrorDeps(), [...envs], since);
          const open = await syncOpenSettlements(productionDeps(), 25);
          return Response.json({ ok: true, ...open, refunds });
        } catch (e) {
          console.error("sync-deposit-refunds failed", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
