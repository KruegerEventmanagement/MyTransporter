/**
 * Auswahl der laufenden eigenen Miete. Rein und testbar; die Datenquelle
 * (RLS + user_id-Filter) liegt im Hook useActiveTrip.
 */
import { resolveTripWindow } from "./trip-time";

/** Status, in denen das Fahrzeug abgeholt und noch nicht bestätigt zurück ist. */
export const ACTIVE_TRIP_STATUSES = [
  "active",
  "started",
  "running",
  "in_progress",
  "picked_up",
  "returning",
  "return_pending",
] as const;

export const RETURNING_STATUSES = ["returning", "return_pending"] as const;

export interface ActiveTripRow {
  id: string;
  user_id: string;
  status: string | null;
  start_date: string;
  start_hour: number | null;
  plan_id: string | null;
  vehicle_name?: string | null;
  vehicle_plate?: string | null;
  return_code?: string | null;
}

export interface ActiveTrip {
  id: string;
  status: string;
  returning: boolean;
  startMs: number;
  endMs: number;
  vehicleName: string;
  vehiclePlate: string;
}

export function isActiveTripStatus(s: string | null | undefined): boolean {
  return !!s && (ACTIVE_TRIP_STATUSES as readonly string[]).includes(s);
}

export function isReturningStatus(s: string | null | undefined): boolean {
  return !!s && (RETURNING_STATUSES as readonly string[]).includes(s);
}

/**
 * Stichtag (Berliner Kalenderdatum, YYYY-MM-DD): Buchungen ab diesem Starttag
 * müssen vollständig zurückgegeben werden. Ältere, nie abgeschlossene Fahrten
 * gelten als verfallen – kein Banner, keine Erinnerung, kein Rückgabeablauf.
 * Daten werden dabei nicht verändert.
 */
export const TRIP_COMPLETION_REQUIRED_FROM = "2026-10-06";

/** Offene Altbuchung (Start vor Stichtag, Status noch nicht abgeschlossen/storniert). */
export function isLegacyOpenTrip(row: { status?: string | null; start_date?: string | null }): boolean {
  if (!row.start_date || row.start_date >= TRIP_COMPLETION_REQUIRED_FROM) return false;
  return row.status !== "completed" && row.status !== "cancelled";
}

/**
 * Deterministisch: nur eigene Zeilen mit aktivem Status. Vorrang hat die
 * gerade geöffnete Buchung, sonst die zuerst endende, dann die ID.
 */
export function pickActiveTrip(
  rows: ActiveTripRow[],
  userId: string | null,
  preferredId?: string | null,
): ActiveTrip | null {
  if (!userId) return null;
  const list = rows
    .filter((r) => r.user_id === userId && isActiveTripStatus(r.status) && !isLegacyOpenTrip(r))
    .map((r) => {
      const w = resolveTripWindow(r);
      return {
        id: r.id,
        status: r.status as string,
        returning: isReturningStatus(r.status),
        startMs: w.startMs,
        endMs: w.endMs,
        vehicleName: r.vehicle_name ?? "",
        vehiclePlate: r.vehicle_plate ?? "",
      };
    });
  if (!list.length) return null;
  if (preferredId) {
    const hit = list.find((t) => t.id === preferredId);
    if (hit) return hit;
  }
  list.sort((a, b) => a.endMs - b.endMs || (a.id < b.id ? -1 : 1));
  return list[0] ?? null;
}

/** Fahrtansicht, in der die globale Leiste nicht erscheint. */
export function isTripPath(pathname: string): boolean {
  return /^\/trip\//.test(pathname);
}

export type TripPhase = "pre" | "active" | "return" | "done";

/** Serverstatus → Phase. Ein lokal gestarteter Rückgabeentwurf hält "return" über Reloads. */
export function phaseFor(status: string | null | undefined, returnStarted: boolean): TripPhase {
  if (status === "completed" || status === "cancelled") return "done";
  if (isReturningStatus(status)) return "return";
  if (status === "active" || status === "started" || status === "running" || status === "in_progress" || status === "picked_up")
    return returnStarted ? "return" : "active";
  return "pre";
}

