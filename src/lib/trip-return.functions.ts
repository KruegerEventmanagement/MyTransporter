import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseReportInput, performReturnReport } from "./trip-return.server";

/** Kunde meldet die physische Rückgabe. Idempotent, eigentums- und statusgeprüft. */
export const reportReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseReportInput(d))
  .handler(async ({ data, context }) => performReturnReport(context.supabase, context.userId, data));
