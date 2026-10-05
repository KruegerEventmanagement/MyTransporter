/**
 * Auswahl für die 10-Minuten-Rückgabeerinnerung per Push (Cron alle 15 min).
 * Idempotent je Mietende: `return_reminder_10min_for` speichert das Ende, für
 * das bereits erinnert wurde. Ändert sich das Ende, wird erneut erinnert.
 */
import { ACTIVE_TRIP_STATUSES, isReturningStatus } from "./active-trip";
import { resolveTripWindow, RETURN_REMINDER_LEAD_MS } from "./trip-time";

/** Der Cron läuft alle 15 Minuten: früheste Erinnerung 15 min vor Ende, bis 30 min danach. */
export const REMINDER_EARLY_MS = 15 * 60_000;
export const REMINDER_LATE_MS = 30 * 60_000;

export interface ReminderRow {
  id: string;
  user_id: string;
  status: string | null;
  start_date: string;
  start_hour: number | null;
  plan_id: string | null;
  return_reminder_10min_for: string | null;
}

export const REMINDER_STATUSES = ACTIVE_TRIP_STATUSES.filter((s) => !isReturningStatus(s));

export function dueReturnReminders(rows: ReminderRow[], nowMs: number): Array<ReminderRow & { endMs: number; endIso: string }> {
  return rows.flatMap((r) => {
    if (!(REMINDER_STATUSES as readonly string[]).includes(r.status ?? "")) return [];
    const { endMs } = resolveTripWindow(r);
    if (nowMs < endMs - Math.max(REMINDER_EARLY_MS, RETURN_REMINDER_LEAD_MS) || nowMs > endMs + REMINDER_LATE_MS) return [];
    const endIso = new Date(endMs).toISOString();
    if (r.return_reminder_10min_for && new Date(r.return_reminder_10min_for).getTime() === endMs) return [];
    return [{ ...r, endMs, endIso }];
  });
}
