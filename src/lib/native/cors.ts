/**
 * CORS nur für die Capacitor-App-Origins und nur für Server-Funktionen/API.
 * Keine Cookies (credentials) – Authentifizierung läuft per Bearer-Token.
 */
export const NATIVE_ORIGINS = new Set(["capacitor://localhost", "https://localhost", "http://localhost"]);

export function nativeCorsHeaders(request: Request): Record<string, string> | null {
  const origin = request.headers.get("origin");
  if (!origin || !NATIVE_ORIGINS.has(origin)) return null;
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/_serverFn") && !path.startsWith("/api/")) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers":
      request.headers.get("access-control-request-headers") ?? "authorization, content-type, x-tsr-serverfn",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

export function withCors(response: Response, cors: Record<string, string> | null): Response {
  if (!cors) return response;
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}
