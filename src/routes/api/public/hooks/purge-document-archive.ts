import { createFileRoute } from "@tanstack/react-router";

/**
 * Löscht abgelaufene Kopien aus dem Dokumentarchiv (nur neu archivierte
 * Datensätze, keine Altbestände). Zugriff nur mit NOTIFY_HOOK_TOKEN; Antwort nur Zähler.
 */
export const Route = createFileRoute("/api/public/hooks/purge-document-archive")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.NOTIFY_HOOK_TOKEN;
        const provided =
          new URL(request.url).searchParams.get("token") ?? request.headers.get("x-hook-token") ?? "";
        if (!token || provided !== token) return new Response("Unauthorized", { status: 401 });
        try {
          const { createPrivacyStore } = await import("@/lib/privacy-store.server");
          const { purgeExpiredArchive } = await import("@/lib/privacy-ops.server");
          const r = await purgeExpiredArchive(await createPrivacyStore(), Date.now());
          return Response.json({ ok: true, ...r });
        } catch (e) {
          console.error("purge-document-archive failed", e instanceof Error ? e.message.slice(0, 200) : "unknown");
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
