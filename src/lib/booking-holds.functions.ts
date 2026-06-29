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
    if (!data.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(data.startDate)) {
      throw new Error("startDate ungültig");
    }
    if (!Number.isInteger(data.startHour) || data.startHour < 0 || data.startHour > 23) {
      throw new Error("startHour ungültig");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Abgelaufene Holds für diesen Slot wegräumen, damit sie keine Verfügbarkeit blocken
    await supabaseAdmin
      .from("booking_holds")
      .delete()
      .lt("expires_at", new Date().toISOString());

    // Konkurrierender Hold von anderem User?
    if (data.vehiclePlate) {
      const { data: conflicts } = await supabaseAdmin
        .from("booking_holds")
        .select("user_id, expires_at")
        .eq("vehicle_plate", data.vehiclePlate)
        .eq("start_date", data.startDate)
        .eq("start_hour", data.startHour)
        .gt("expires_at", new Date().toISOString());
      const foreign = (conflicts ?? []).find((c) => c.user_id !== userId);
      if (foreign) {
        throw new Error("Dieses Zeitfenster wird gerade von einer anderen Person reserviert. Bitte wähle einen anderen Termin.");
      }
    }

    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();

    // Eigene vorhandene Holds für denselben Slot durch frische ersetzen
    await supabase
      .from("booking_holds")
      .delete()
      .eq("user_id", userId)
      .eq("start_date", data.startDate)
      .eq("start_hour", data.startHour);

    const { data: row, error } = await supabase
      .from("booking_holds")
      .insert({
        user_id: userId,
        vehicle_id: data.vehicleId ?? null,
        vehicle_plate: data.vehiclePlate ?? null,
        plan_id: data.planId,
        start_date: data.startDate,
        start_hour: data.startHour,
        expires_at: expiresAt,
      })
      .select("id, expires_at")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Reservierung konnte nicht angelegt werden");
    return { holdId: row.id, expiresAt: row.expires_at };
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