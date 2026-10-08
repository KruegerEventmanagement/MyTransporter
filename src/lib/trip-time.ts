/**
 * Zentraler Zeit-Resolver für laufende Mieten.
 *
 * Buchungen speichern Beginn als Berliner Wanduhrzeit (`start_date` +
 * `start_hour`) und das Ende implizit über `plan_id`. Diese Datei spiegelt
 * exakt die DB-Funktionen `public.local_start_at` und `public.plan_end_at`,
 * damit Fahrtansicht, Erinnerung und Verfügbarkeit dasselbe Ende verwenden.
 * Es gibt im Schema keine separaten Verlängerungs-/Minutenfelder; ändert sich
 * `plan_id`/`start_*` (z. B. durch den Admin), ändert sich das Ende mit.
 */
import { berlinDateHourToMs, berlinWallClockToMs } from "./berlin-time";

export interface TripTimeSource {
  start_date: string;
  start_hour: number | null;
  plan_id: string | null;
}

export interface TripWindow {
  startMs: number;
  endMs: number;
}

const HOUR = 3_600_000;
export const RETURN_REMINDER_LEAD_MS = 10 * 60_000;

/** Spiegel von public.plan_end_at (Stunden je Tarif). null = unbekannt. */
export function planHours(planId: string | null | undefined): number | null {
  const p = planId ?? "";
  if (p === "3h") return 3;
  if (p === "6h") return 6;
  if (["24h", "24h_short", "24h_long", "24h_300", "24h_300km", "24h_500", "24h_800"].includes(p)) return 24;
  const multi = /^multi_([2-7])d$/.exec(p);
  if (multi) return Number(multi[1]) * 24;
  const week = /^week_x([0-9]+)$/.exec(p);
  if (week) return Math.max(1, Number(week[1])) * 168;
  return null;
}

export function resolveTripWindow(b: TripTimeSource): TripWindow {
  const startMs = berlinDateHourToMs(b.start_date, b.start_hour ?? 0);
  if (b.plan_id === "km") {
    // Kilometertarif endet am Starttag um 22:00 Berliner Zeit.
    const [y, m, d] = b.start_date.split("-").map(Number);
    return { startMs, endMs: berlinWallClockToMs(y ?? 1970, m ?? 1, d ?? 1, 22) };
  }
  // Unbekannte Tarife konservativ wie in der DB als 24 h.
  const hours = planHours(b.plan_id) ?? 24;
  return { startMs, endMs: startMs + hours * HOUR };
}

export type ReturnTimeState = "running" | "reminder" | "overdue";

/** Zustand relativ zum Mietende. Frühere Rückgabe ist immer erlaubt. */
export function returnTimeState(nowMs: number, endMs: number): ReturnTimeState {
  if (nowMs >= endMs) return "overdue";
  if (nowMs >= endMs - RETURN_REMINDER_LEAD_MS) return "reminder";
  return "running";
}

/** Millisekunden bis zur 10-Minuten-Erinnerung (0 = jetzt fällig/überfällig). */
export function msUntilReminder(nowMs: number, endMs: number): number {
  return Math.max(0, endMs - RETURN_REMINDER_LEAD_MS - nowMs);
}

const berlinFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatBerlin(ms: number): string {
  return berlinFmt.format(new Date(ms));
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
