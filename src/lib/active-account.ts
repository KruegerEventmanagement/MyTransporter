import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/**
 * Ein noch gültiges JWT eines gelöschten/inaktiven Kontos darf keine
 * Serverfunktion mehr nutzen. Fail closed: Fehler der Prüfung = kein Zugriff.
 */
export async function assertActiveAccount(client: RpcClient, uid: string): Promise<void> {
  let active = false;
  try {
    const { data, error } = await client.rpc("is_account_active", { _uid: uid });
    active = !error && data === true;
  } catch {
    active = false;
  }
  if (!active) throw new Response("Unauthorized: account inactive", { status: 401 });
}

/** Stabiler Wrapper um die generierte Auth-Middleware (die bleibt unverändert). */
export const requireActiveAccount = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    await assertActiveAccount(context.supabase as unknown as RpcClient, context.userId);
    return next();
  });
