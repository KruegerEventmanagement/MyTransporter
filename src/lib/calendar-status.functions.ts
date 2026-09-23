import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { summarizeCalendarState, type CalendarStateRow, type CalendarSyncStatus } from "@/lib/calendar-status";

export type { CalendarSyncStatus } from "@/lib/calendar-status";

const PAGE = 1000;

/** Geschützter Admin-Status der Google-Kalender-Übertragung (nur Zähler, keine Kundendaten). */
export const getCalendarSyncStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CalendarSyncStatus> => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) throw new Error("Forbidden");

    const credentialsConfigured = Boolean(process.env.LOVABLE_API_KEY && process.env.GOOGLE_CALENDAR_API_KEY);
    // Vollständige, paginierte Minimalauswahl (RLS: nur Admins) – keine Unterzählung.
    const rows: CalendarStateRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await context.supabase
        .from("calendar_sync_state")
        .select("version, synced_version, synced_at, last_error, updated_at")
        .order("source_type")
        .order("source_id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error("Kalenderstatus nicht lesbar");
      rows.push(...((data ?? []) as CalendarStateRow[]));
      if (!data || data.length < PAGE) break;
    }
    return summarizeCalendarState(rows, credentialsConfigured);
  });
