import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CalendarSyncStatus = {
  connected: boolean;
  pending: number;
  failed: number;
  lastSuccessAt: string | null;
  lastError: string | null;
};

/** Geschützter Admin-Status der Google-Kalender-Übertragung (nur Zähler, keine Kundendaten). */
export const getCalendarSyncStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CalendarSyncStatus> => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) throw new Error("Forbidden");

    const connected = Boolean(process.env.LOVABLE_API_KEY && process.env.GOOGLE_CALENDAR_API_KEY);
    const { data: rows, error } = await context.supabase
      .from("calendar_sync_state")
      .select("status, version, synced_version, synced_at, last_error, updated_at")
      .limit(2000);
    if (error) throw new Error(error.message);

    let pending = 0;
    let failed = 0;
    let lastSuccessAt: string | null = null;
    let lastError: string | null = null;
    let lastErrAt = "";
    for (const r of (rows ?? []) as Array<Record<string, any>>) {
      if (Number(r.synced_version) < Number(r.version)) pending++;
      if (r.last_error && Number(r.synced_version) < Number(r.version)) {
        failed++;
        if (String(r.updated_at) > lastErrAt) {
          lastErrAt = String(r.updated_at);
          lastError = String(r.last_error).slice(0, 300);
        }
      }
      if (r.synced_at && (!lastSuccessAt || r.synced_at > lastSuccessAt)) lastSuccessAt = r.synced_at;
    }
    return { connected, pending, failed, lastSuccessAt, lastError };
  });
