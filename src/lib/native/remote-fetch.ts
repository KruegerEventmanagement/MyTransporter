/**
 * Native App: Die App-Shell liegt lokal im Bundle (capacitor://localhost).
 * Server-Funktionen und API-Routen bleiben auf dem bestehenden Worker. Relative
 * Aufrufe auf diese Pfade werden deshalb auf die öffentliche Origin umgeschrieben.
 * Alles andere (lokale Assets, Supabase, Google) bleibt unverändert.
 */
const REMOTE_PREFIXES = ["/_serverFn", "/api/"];

export function rewriteToRemote(url: string, localOrigin: string, remoteOrigin: string): string {
  let path: string;
  if (url.startsWith("/")) {
    path = url;
  } else if (url.startsWith(localOrigin + "/")) {
    path = url.slice(localOrigin.length);
  } else {
    return url;
  }
  if (!REMOTE_PREFIXES.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : p + "/") || path.startsWith(p + "?"))) {
    return url;
  }
  return remoteOrigin.replace(/\/$/, "") + path;
}

let installed = false;

export function installRemoteFetch(remoteOrigin: string): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  const localOrigin = window.location.origin;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") return original(rewriteToRemote(input, localOrigin, remoteOrigin), init);
    if (input instanceof URL) return original(rewriteToRemote(input.toString(), localOrigin, remoteOrigin), init);
    const target = rewriteToRemote(input.url, localOrigin, remoteOrigin);
    return original(target === input.url ? input : new Request(target, input), init);
  };
}
