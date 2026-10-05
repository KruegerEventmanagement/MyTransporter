/**
 * Auswahl für die 10-Minuten-Rückgabeerinnerung per Push (eigener Job, minütlich).
 * Idempotent je Mietende: `return_reminder_10min_for` speichert das Ende, für
 * das bereits erinnert wurde. Ändert sich das Ende, wird erneut erinnert.
 */
import { ACTIVE_TRIP_STATUSES, isReturningStatus } from "./active-trip";
import { resolveTripWindow, RETURN_REMINDER_LEAD_MS } from "./trip-time";

/** Fällig ab endAt − 10 min (minütlicher Job ⇒ höchstens ~1 min später); bis 30 min nach Ende nachholen. */
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
    if (nowMs < endMs - RETURN_REMINDER_LEAD_MS || nowMs > endMs + REMINDER_LATE_MS) return [];
    const endIso = new Date(endMs).toISOString();
    if (r.return_reminder_10min_for && new Date(r.return_reminder_10min_for).getTime() === endMs) return [];
    return [{ ...r, endMs, endIso }];
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ReminderDeps {
  client: { from: (t: any) => any };
  push: (userId: string, payload: { title: string; body: string; url: string; tag: string }) => Promise<{ sent: number }>;
  now: () => number;
  formatEnd: (ms: number) => string;
}

/**
 * Lädt aktive Mieten, claimt atomar (Ende + Status + Zeitraum unverändert)
 * und sendet erst danach. Mehrfachläufe senden pro Mietende höchstens einmal.
 */
export async function processReturnReminders(deps: ReminderDeps): Promise<{ due: number; claimed: number; pushed: number }> {
  const { data, error } = await deps.client
    .from("bookings")
    .select("id, user_id, status, start_date, start_hour, plan_id, return_reminder_10min_for")
    .in("status", [...REMINDER_STATUSES]);
  if (error) throw new Error("Buchungen konnten nicht geladen werden.");
  const due = dueReturnReminders((data ?? []) as ReminderRow[], deps.now());
  let claimed = 0;
  let pushed = 0;
  for (const b of due) {
    let claim = deps.client
      .from("bookings")
      .update({ return_reminder_10min_for: b.endIso })
      .eq("id", b.id)
      .eq("status", b.status)
      .eq("plan_id", b.plan_id)
      .eq("start_date", b.start_date)
      .eq("start_hour", b.start_hour);
    claim = b.return_reminder_10min_for
      ? claim.eq("return_reminder_10min_for", b.return_reminder_10min_for)
      : claim.is("return_reminder_10min_for", null);
    const { data: won, error: claimErr } = await claim.select("id");
    if (claimErr || !Array.isArray(won) || won.length === 0) continue;
    claimed++;
    try {
      const r = await deps.push(b.user_id, {
        title: "Rückgabe in Kürze",
        body: `Deine Miete endet ${deps.formatEnd(b.endMs)} Uhr. Sobald du sicher geparkt hast, starte die Rückgabe.`,
        url: `/trip/${b.id}`,
        tag: `mt-return-${b.id}`,
      });
      pushed += r.sent;
    } catch {
      /* Push-Fehler blockieren keine anderen Erinnerungen; on-screen-Hinweis bleibt */
    }
  }
  return { due: due.length, claimed, pushed };
}
