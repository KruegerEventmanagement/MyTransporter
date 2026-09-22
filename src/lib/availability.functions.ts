import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BLOCKING_BOOKING_STATUSES } from "@/lib/booking-status";
import { bookingWindowMs } from "@/lib/booking-window";

/**
 * Sperrintervall einer Buchung/Reservierung in echter Zeit.
 * `start_date` + `start_hour` sind LOKALE Berliner Zeit – deshalb explizit
 * umrechnen (identisch zu `local_start_at` + `plan_end_at` in der Datenbank).
 */
function blockInterval(planId: string, dateStr: string, hour: number): { start: string; end: string } {
  const w = bookingWindowMs(planId, dateStr, hour);
  return { start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString() };
}

export type BusySlot = {
  vehiclePlate: string;
  start: string; // ISO
  end: string;   // ISO
};

/** Liefert alle aktuell belegten Zeitfenster (anonymisiert: nur Fahrzeug + Start/Ende). */
export const getBusySlots = createServerFn({ method: "GET" })
  .handler(async (): Promise<BusySlot[]> => {
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select("vehicle_plate, plan_id, start_date, start_hour, status")
      .in("status", [...BLOCKING_BOOKING_STATUSES]);
    if (error) throw new Error(error.message);
    const bookingSlots = (data ?? [])
      .filter((b) => b.start_date && b.start_hour !== null)
      .map((b) => ({
        vehiclePlate: b.vehicle_plate ?? "",
        ...blockInterval(b.plan_id, b.start_date as string, b.start_hour as number),
      }));

    // Aktive, nicht abgelaufene Reservierungen blockieren das Zeitfenster ebenfalls
    const { data: holds, error: holdsError } = await supabaseAdmin
      .from("booking_holds")
      .select("vehicle_plate, plan_id, start_date, start_hour, expires_at")
      .gt("expires_at", new Date().toISOString());
    if (holdsError) throw new Error(holdsError.message);

    const holdSlots = (holds ?? [])
      .filter((h) => h.start_date && h.start_hour !== null)
      .map((h) => ({
        vehiclePlate: h.vehicle_plate ?? "",
        ...blockInterval(h.plan_id, h.start_date as string, h.start_hour as number),
      }));

    // Manuelle Fahrzeug-Sperren (Wartung, Offline-Vermietung, Verfügbarkeitsstart)
    const { data: blocks, error: blocksError } = await supabaseAdmin
      .from("vehicle_blocks")
      .select("vehicle_plate, start_at, end_at");
    if (blocksError) throw new Error(blocksError.message);

    const blockSlots = (blocks ?? []).map((b) => ({
      vehiclePlate: b.vehicle_plate ?? "",
      start: new Date(b.start_at).toISOString(),
      end: new Date(b.end_at).toISOString(),
    }));

    // Manuell im Adminkalender eingetragene Termine (Offline-Vermietung, Reservierung)
    const { data: manual, error: manualError } = await supabaseAdmin
      .from("manual_reservations")
      .select("vehicle_plate, start_at, end_at");
    if (manualError) throw new Error(manualError.message);

    const manualSlots = (manual ?? []).map((m) => ({
      vehiclePlate: m.vehicle_plate ?? "",
      start: new Date(m.start_at).toISOString(),
      end: new Date(m.end_at).toISOString(),
    }));

    return [...bookingSlots, ...holdSlots, ...blockSlots, ...manualSlots];
  });

