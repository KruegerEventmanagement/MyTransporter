import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BusySlot = {
  vehiclePlate: string;
  start: string; // ISO
  end: string;   // ISO
};

function durationHoursForPlan(planId: string): number {
  if (planId === "6h") return 6;
  if (planId === "24h") return 24;
  return 24; // km – Tag blockieren
}

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
        const end = new Date(start.getTime() + durationHoursForPlan(b.plan_id) * 3600_000);
        return {
          vehiclePlate: b.vehicle_plate ?? "",
          start: start.toISOString(),
          end: end.toISOString(),
        };
      });
  });
