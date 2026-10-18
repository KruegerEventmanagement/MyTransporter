/** Nur interne Pfade aus Push-Daten zulassen (wie mtResolveTarget im Service Worker). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolvePushTarget(url: unknown): string {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) return "/";
  if (/^\/trip\/[A-Za-z0-9-]{1,64}$/.test(url)) return url;
  if (/^\/buchung\/[A-Za-z0-9-]{1,64}$/.test(url)) return url;
  // Admin: sichere Query-Deep-Links (Kaution/Kunde) zulassen, sonst nur der Pfad.
  if (url === "/admin" || url === "/profil") return url;
  if (url.startsWith("/admin?") || url.startsWith("/profil?")) {
    try {
      const u = new URL(url, "https://app.local");
      const k = u.searchParams.get("kaution");
      if (k === "list") return "/admin?kaution=list";
      if (k && /^(booking|manual):[0-9a-f-]{36}$/i.test(k)) return `/admin?kaution=${encodeURIComponent(k)}`;
      const kunde = u.searchParams.get("kunde");
      if (kunde && UUID.test(kunde)) return `/admin?kunde=${kunde}`;
      return u.pathname;
    } catch {
      return "/";
    }
  }
  if (/^\/(admin|profil)\//.test(url)) return url;
  return "/";
}
