import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

const SESSION_TIMEOUT_MS = 1500;

async function getSessionTokenSafely(): Promise<string | undefined> {
  try {
    const timeout = new Promise<undefined>((resolve) => {
      window.setTimeout(() => resolve(undefined), SESSION_TIMEOUT_MS);
    });
    const session = supabase.auth
      .getSession()
      .then(({ data }) => data.session?.access_token);
    return await Promise.race([session, timeout]);
  } catch {
    return undefined;
  }
}

export const attachSupabaseAuthSafely = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = await getSessionTokenSafely();
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);