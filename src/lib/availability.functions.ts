import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computePlanReturn } from "@/lib/booking-rules";

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
      .in("status", ["paid", "active", "in_progress", "picked_up"]);
    if (error) throw new Error(error.message);
    if (!data) return [];

    return data
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
  });
