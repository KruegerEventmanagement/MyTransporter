/**
 * Zentrale Buchungs-/Mietregeln.
 * Regeln (mit Kunden abgestimmt):
 *  - Späteste Abholung: 20:00 Uhr
 *  - Späteste Rückgabe: 22:00 Uhr
 *  - 6-Stunden-Tarif:  Rückgabe = Start + 6h, muss bis spätestens 22:00 sein
 *                      → späteste Startzeit 16:00 Uhr
 *  - 24-Stunden-Tarif: Rückgabe = Start + 24h (am Folgetag zur selben Uhrzeit)
 *  - Kilometer-Tarif:  Rückgabe spätestens am selben Tag um 22:00 Uhr
 */

export const EARLIEST_START_HOUR = 8;
export const LATEST_START_HOUR = 20;
export const LATEST_RETURN_HOUR = 22;

export type PlanId = "6h" | "24h" | "km" | string;

/** Liefert das exakte Rückgabe-Datum/-Uhrzeit für einen Tarif. */
export function computePlanReturn(planId: PlanId, startDate: Date, startHour: number): Date {
  const start = new Date(startDate);
  start.setHours(startHour, 0, 0, 0);
  if (planId === "6h") return new Date(start.getTime() + 6 * 3600_000);
  if (planId === "24h") return new Date(start.getTime() + 24 * 3600_000);
  // km: bis spätestens 22:00 desselben Kalendertages
  const end = new Date(start);
  end.setHours(LATEST_RETURN_HOUR, 0, 0, 0);
  return end;
}

/** Dauer (ms), die eine Buchung das Fahrzeug blockiert. */
export function planBlockDurationMs(planId: PlanId, startDate: Date, startHour: number): number {
  const start = new Date(startDate);
  start.setHours(startHour, 0, 0, 0);
  const end = computePlanReturn(planId, startDate, startHour);
  return Math.max(0, end.getTime() - start.getTime());
}

/** Gibt es überhaupt eine gültige Startzeit für diesen Tarif an diesem Tag? */
export function isStartHourAllowed(planId: PlanId, startHour: number): boolean {
  if (startHour < EARLIEST_START_HOUR || startHour > LATEST_START_HOUR) return false;
  if (planId === "6h") return startHour + 6 <= LATEST_RETURN_HOUR;
  return true;
}
