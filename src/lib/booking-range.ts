import { resolveTripWindow, type TripTimeSource } from "./trip-time";

const dayFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

function durationLabel(ms: number): string {
  const h = Math.round(ms / 3_600_000);
  if (h < 24 || h % 24 !== 0) return `${h} Std.`;
  const d = h / 24;
  return d === 1 ? "1 Tag" : `${d} Tage`;
}

/** „Sa., 24.10.2026, 10:00 – Sa., 24.10.2026, 16:00 Uhr · 6 Std." (Berliner Zeit, Ende wie plan_end_at). */
export function formatBookingRange(b: TripTimeSource): string {
  const { startMs, endMs } = resolveTripWindow(b);
  const s = new Date(startMs);
  const e = new Date(endMs);
  return `${dayFmt.format(s)}, ${timeFmt.format(s)} – ${dayFmt.format(e)}, ${timeFmt.format(e)} Uhr · ${durationLabel(endMs - startMs)}`;
}
