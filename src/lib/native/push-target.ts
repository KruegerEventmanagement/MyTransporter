/** Nur interne Pfade aus Push-Daten zulassen (wie mtResolveTarget im Service Worker). */
export function resolvePushTarget(url: unknown): string {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) return "/";
  if (/^\/trip\/[A-Za-z0-9-]{1,64}$/.test(url)) return url;
  if (/^\/(admin|profil)(\/.*)?$/.test(url)) return url;
  if (/^\/buchung\/[A-Za-z0-9-]{1,64}$/.test(url)) return url;
  return "/";
}
