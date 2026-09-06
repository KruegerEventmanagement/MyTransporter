/**
 * Zentrale serverseitige Verfügbarkeitsprüfung.
 *
 * Alle Konflikt-Regeln leben in der Datenbank (public.vehicle_conflicts /
 * public.is_vehicle_available / public.create_booking_hold_atomic), damit
 * Prüfung und Reservierung atomar in einer Transaktion mit Fahrzeug-Sperre
 * laufen. Intervall-Logik: Konflikt genau dann, wenn
 * requestedStart < existingEnd AND requestedEnd > existingStart.
 * Grenzen sind [start, end) – exakt angrenzende Buchungen sind erlaubt.
 * Alle Zeiten werden in Europe/Berlin interpretiert.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type VehicleConflict = {
  source: "booking" | "hold" | "block" | "manual";
  ref_id: string | null;
  start_at: string;
  end_at: string;
};

function rpc(): RpcClient {
  return supabaseAdmin as unknown as RpcClient;
}

/** Startzeitpunkt (Europe/Berlin) als ISO-String. */
export function berlinStartIso(startDate: string, startHour: number): string {
  // Die DB rechnet selbst in Europe/Berlin; hier nur für Fehlermeldungen.
  return `${startDate}T${String(startHour).padStart(2, "0")}:00:00`;
}

/** Liefert alle Konflikte für Fahrzeug + Tarif-Zeitraum. */
export async function findVehicleConflicts(params: {
  vehiclePlate: string;
  planId: string;
  startDate: string;
  startHour: number;
  /** Eigene Holds dieses Users zählen nicht als Fremdkonflikt. */
  ignoreHoldUserId?: string | null;
  /** Eigene Buchung (z. B. beim Reconcile) ausschließen. */
  ignoreBookingId?: string | null;
}): Promise<VehicleConflict[]> {
  const { data, error } = await rpc().rpc("vehicle_conflicts_for_plan", {
    _plate: params.vehiclePlate,
    _plan_id: params.planId,
    _start_date: params.startDate,
    _start_hour: params.startHour,
    _ignore_hold_user: params.ignoreHoldUserId ?? null,
    _ignore_booking_id: params.ignoreBookingId ?? null,
  });
  if (error) throw new Error(`Verfügbarkeitsprüfung fehlgeschlagen: ${error.message}`);
  return (data as VehicleConflict[] | null) ?? [];
}

function formatBerlin(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function conflictMessage(conflicts: VehicleConflict[]): string {
  const c = conflicts[0];
  if (!c) return "Dieses Fahrzeug ist im gewählten Zeitraum leider nicht verfügbar.";
  return (
    "Dieses Fahrzeug ist im gewählten Zeitraum leider nicht mehr verfügbar " +
    `(belegt von ${formatBerlin(c.start_at)} bis ${formatBerlin(c.end_at)} Uhr). ` +
    "Bitte wähle einen anderen Zeitraum oder ein anderes Fahrzeug."
  );
}

/** Wirft einen sprechenden Fehler, wenn das Fahrzeug im Zeitraum belegt ist. */
export async function assertVehicleAvailable(params: {
  vehiclePlate: string | null | undefined;
  planId: string;
  startDate: string;
  startHour: number;
  ignoreHoldUserId?: string | null;
  ignoreBookingId?: string | null;
}): Promise<void> {
  if (!params.vehiclePlate) return;
  const conflicts = await findVehicleConflicts({
    vehiclePlate: params.vehiclePlate,
    planId: params.planId,
    startDate: params.startDate,
    startHour: params.startHour,
    ignoreHoldUserId: params.ignoreHoldUserId ?? null,
    ignoreBookingId: params.ignoreBookingId ?? null,
  });
  if (conflicts.length > 0) throw new Error(conflictMessage(conflicts));
}

/** Atomar (Advisory Lock pro Fahrzeug) eine 15-Minuten-Reservierung anlegen. */
export async function createHoldAtomic(params: {
  userId: string;
  vehicleId?: string | null;
  vehiclePlate?: string | null;
  planId: string;
  startDate: string;
  startHour: number;
  minutes: number;
}): Promise<{ holdId: string; expiresAt: string }> {
  const { data, error } = await rpc().rpc("create_booking_hold_atomic", {
    _user_id: params.userId,
    _vehicle_id: params.vehicleId ?? null,
    _vehicle_plate: params.vehiclePlate ?? null,
    _plan_id: params.planId,
    _start_date: params.startDate,
    _start_hour: params.startHour,
    _minutes: params.minutes,
  });
  if (error) {
    if (error.message.includes("VEHICLE_UNAVAILABLE")) {
      throw new Error(
        "Dieses Fahrzeug wurde für den gewählten Zeitraum gerade belegt. Bitte wähle einen anderen Termin oder ein anderes Fahrzeug.",
      );
    }
    throw new Error(error.message);
  }
  const row = (data as Array<{ hold_id: string; expires_at: string }> | null)?.[0];
  if (!row) throw new Error("Reservierung konnte nicht angelegt werden");
  return { holdId: row.hold_id, expiresAt: row.expires_at };
}
