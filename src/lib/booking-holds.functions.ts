import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const HOLD_MINUTES = 15;

export const createBookingHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    vehicleId?: string | null;
    vehiclePlate?: string | null;
    planId: string;
    startDate: string; // YYYY-MM-DD
    startHour: number;
  }) => {
    if (!data.planId) throw new Error("planId fehlt");
    // Miet-Holds ohne Kennzeichen würden Advisory Lock und Konfliktprüfung
    // umgehen – deshalb serverseitig verpflichtend.
    if (!data.vehiclePlate || !data.vehiclePlate.trim()) {
      throw new Error("Kein Fahrzeug gewählt – Reservierung nicht möglich.");
    }
    if (!data.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(data.startDate)) {
      throw new Error("startDate ungültig");
    }
    if (!Number.isInteger(data.startHour) || data.startHour < 0 || data.startHour > 23) {
      throw new Error("startHour ungültig");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { createHoldAtomic } = await import("@/lib/availability.server");

    // Atomar: Advisory Lock pro Fahrzeug + vollständige Intervallprüfung gegen
    // bezahlte Buchungen, manuelle Reservierungen, Sperren und fremde Holds.
    return await createHoldAtomic({
      userId,
      vehicleId: data.vehicleId ?? null,
      vehiclePlate: data.vehiclePlate ?? null,
      planId: data.planId,
      startDate: data.startDate,
      startHour: data.startHour,
      minutes: HOLD_MINUTES,
    });
  });

export const releaseBookingHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { holdId?: string; startDate?: string; startHour?: number }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("booking_holds").delete().eq("user_id", userId);
    if (data.holdId) q = q.eq("id", data.holdId);
    if (data.startDate) q = q.eq("start_date", data.startDate);
    if (typeof data.startHour === "number") q = q.eq("start_hour", data.startHour);
    await q;
    return { ok: true };
  });
