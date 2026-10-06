import { createFileRoute } from "@tanstack/react-router";

/**
 * Stündlicher Datenschutz-Job: nimmt bestätigte Löschanträge wieder auf
 * und löscht abgelaufene Kopien aus dem neuen Dokumentarchiv (keine Altbestände).
 * Zugriff nur mit NOTIFY_HOOK_TOKEN im Header x-hook-token; Antwort nur Zähler.
 */
export function hookAuthorized(request: Request, token: string | undefined): boolean {
  const provided = request.headers.get("x-hook-token") ?? "";
  if (!token || provided.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/purge-document-archive")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!hookAuthorized(request, process.env.NOTIFY_HOOK_TOKEN)) return new Response("Unauthorized", { status: 401 });
        try {
          const { createPrivacyStore } = await import("@/lib/privacy-store.server");
          const { purgeExpiredArchive, resumePendingDeletions } = await import("@/lib/privacy-ops.server");
          const store = await createPrivacyStore();
          const deletions = await resumePendingDeletions(store, Date.now());
          const archive = await purgeExpiredArchive(store, Date.now());
          return Response.json({ ok: true, deletions, archive });
        } catch (e) {
          console.error("privacy-maintenance failed", e instanceof Error ? e.message.slice(0, 200) : "unknown");
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
