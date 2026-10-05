import { describe, expect, it } from "vitest";
import { bookingWindowMs, planDurationHours } from "./booking-window";
import { resolveTripWindow } from "./trip-time";

// Spiegel von public.plan_end_at: Verfügbarkeit und Fahrtansicht müssen dasselbe Ende liefern.
const PLANS = [
  "3h", "6h", "24h", "24h_short", "24h_long", "24h_300", "24h_500", "24h_800",
  "multi_2d", "multi_3d", "multi_4d", "multi_5d", "multi_6d", "multi_7d",
  "week_x1", "week_x2", "week_x4", "week_x12", "km", "unbekannt",
];
const SQL_HOURS: Record<string, number> = {
  "3h": 3, "6h": 6, multi_2d: 48, multi_3d: 72, multi_4d: 96, multi_5d: 120, multi_6d: 144, multi_7d: 168,
  week_x1: 168, week_x2: 336, week_x4: 672, week_x12: 2016, unbekannt: 24,
};

describe("bookingWindowMs = plan_end_at (inkl. week_xN)", () => {
  for (const plan of PLANS) {
    for (const [date, hour] of [["2026-10-05", 10], ["2026-10-24", 20], ["2026-03-28", 9]] as const) {
      it(`${plan} ab ${date} ${hour}:00`, () => {
        const w = bookingWindowMs(plan, date, hour);
        const t = resolveTripWindow({ plan_id: plan, start_date: date, start_hour: hour });
        expect(w).toEqual({ start: t.startMs, end: t.endMs });
      });
    }
  }
  it("week_xN ist N × 168 h, nie pauschal 24 h", () => {
    for (const [p, h] of Object.entries(SQL_HOURS)) if (p.startsWith("week")) expect(planDurationHours(p)).toBe(h);
    const w = bookingWindowMs("week_x2", "2026-10-05", 10);
    expect((w.end - w.start) / 3_600_000).toBe(336);
  });
  it("Dauer über Zeitumstellung bleibt echte Stunden wie timestamptz + interval", () => {
    for (const [p, h] of Object.entries(SQL_HOURS)) {
      const w = bookingWindowMs(p, "2026-10-20", 10);
      expect((w.end - w.start) / 3_600_000).toBe(h);
    }
  });
});
