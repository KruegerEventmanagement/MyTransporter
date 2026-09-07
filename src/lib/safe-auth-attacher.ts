import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

/**
 * Großzügiges Sicherheitslimit: direkt nach der Registrierung braucht das
 * Lesen der frisch geschriebenen Sitzung (Vorschau-Modus: gebrokerter
 * Speicher) deutlich länger als eine Sekunde. Ein zu kurzes Limit führte
 * dazu, dass der Token weggelassen wurde und geschützte Server-Funktionen
 * (z. B. "Sicher bezahlen") mit 401 fehlschlugen.
 */
const SESSION_TIMEOUT_MS = 8000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function readToken(timeoutMs: number): Promise<string | undefined> {
  try {
    const timeout = sleep(timeoutMs).then(() => undefined);
    const session = supabase.auth
      .getSession()
      .then(({ data }) => data.session?.access_token);
    return await Promise.race([session, timeout]);
  } catch {
    return undefined;
  }
}

export async function getSupabaseAccessToken(): Promise<string | undefined> {
  const token = await readToken(SESSION_TIMEOUT_MS);
  if (token) return token;
  // Einmaliger kurzer Neuversuch – hilft, wenn die Sitzung gerade geschrieben wird.
  await sleep(300);
  return readToken(3000);
}

export const attachSupabaseAuthSafely = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = await getSupabaseAccessToken();
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
