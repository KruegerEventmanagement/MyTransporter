import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computePlanReturn } from "@/lib/booking-rules";
import { BLOCKING_BOOKING_STATUSES } from "@/lib/booking-status";

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
      .map((b) => {
        const start = new Date(`${b.start_date}T${String(b.start_hour).padStart(2, "0")}:00:00`);
        const end = computePlanReturn(b.plan_id, start, b.start_hour as number);
        return {
          vehiclePlate: b.vehicle_plate ?? "",
          start: start.toISOString(),
          end: end.toISOString(),
        };
      });

    // Aktive, nicht abgelaufene Reservierungen blockieren das Zeitfenster ebenfalls
    const { data: holds } = await supabaseAdmin
      .from("booking_holds")
      .select("vehicle_plate, plan_id, start_date, start_hour, expires_at")
      .gt("expires_at", new Date().toISOString());

    const holdSlots = (holds ?? [])
      .filter((h) => h.start_date && h.start_hour !== null)
      .map((h) => {
        const start = new Date(`${h.start_date}T${String(h.start_hour).padStart(2, "0")}:00:00`);
        const end = computePlanReturn(h.plan_id, start, h.start_hour as number);
        return {
          vehiclePlate: h.vehicle_plate ?? "",
          start: start.toISOString(),
          end: end.toISOString(),
        };
      });

    // Manuelle Fahrzeug-Sperren (Wartung, Offline-Vermietung, Verfügbarkeitsstart)
    const { data: blocks } = await supabaseAdmin
      .from("vehicle_blocks")
      .select("vehicle_plate, start_at, end_at");

    const blockSlots = (blocks ?? []).map((b) => ({
      vehiclePlate: b.vehicle_plate ?? "",
      start: new Date(b.start_at).toISOString(),
      end: new Date(b.end_at).toISOString(),
    }));

    // Manuell im Adminkalender eingetragene Termine (Offline-Vermietung, Reservierung)
    const { data: manual } = await supabaseAdmin
      .from("manual_reservations")
      .select("vehicle_plate, start_at, end_at");

    const manualSlots = (manual ?? []).map((m) => ({
      vehiclePlate: m.vehicle_plate ?? "",
      start: new Date(m.start_at).toISOString(),
      end: new Date(m.end_at).toISOString(),
    }));

    return [...bookingSlots, ...holdSlots, ...blockSlots, ...manualSlots];
  });

