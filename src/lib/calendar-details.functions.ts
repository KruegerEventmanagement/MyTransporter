import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAccount } from "@/lib/active-account";
import { loadCalendarEntryDetails, type CalendarEntryDetails } from "@/lib/calendar-details.server";

export type { CalendarEntryDetails, DetailDoc } from "@/lib/calendar-details.server";

/**
 * Admin-only: vollständige Details einer Kalenderbelegung. Der Client nennt
 * nur Art + ID; Profil, Dokumente und Speicherpfade löst der Server auf.
 */
export const getCalendarEntryDetails = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((input: unknown) =>
    z.object({ kind: z.enum(["booking", "manual"]), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CalendarEntryDetails> => {
    return loadCalendarEntryDetails(context.supabase, context.userId, data.kind, data.id);
  });
