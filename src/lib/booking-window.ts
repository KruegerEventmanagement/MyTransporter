import { getPlanById, LATEST_RETURN_HOUR, type PlanId } from "@/lib/booking-rules";
import { berlinDateHourToMs, berlinDayHourToMs } from "@/lib/berlin-time";

/** Dauer eines Tarifs in Stunden (Spiegel von `public.plan_end_at`). */
export function planDurationHours(planId: string): number {
  const plan = getPlanById(planId as PlanId);
  if (plan) return plan.durationHours;
  if (planId === "3h") return 3;
  if (planId === "6h") return 6;
  return 24;
}

/**
 * Sperr-/Mietintervall [start, end) einer Buchung in echter Zeit.
 * `startDate`/`hour` sind immer LOKALE Berliner Zeit.
 */
export function bookingWindowMs(planId: string, dateStr: string, hour: number): { start: number; end: number } {
  const start = berlinDateHourToMs(dateStr, hour);
  const end =
    planId === "km"
      ? berlinDateHourToMs(dateStr, LATEST_RETURN_HOUR)
      : start + planDurationHours(planId) * 3600_000;
  return { start, end };
}

/** Wie `bookingWindowMs`, aber mit einem Kalendertag-Objekt aus der UI. */
export function bookingWindowMsForDay(planId: string, day: Date, hour: number): { start: number; end: number } {
  const start = berlinDayHourToMs(day, hour);
  const end =
    planId === "km"
      ? berlinDayHourToMs(day, LATEST_RETURN_HOUR)
      : start + planDurationHours(planId) * 3600_000;
  return { start, end };
}
