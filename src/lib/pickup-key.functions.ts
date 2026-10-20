import { createServerFn } from "@tanstack/react-start";
import { requireActiveAccount } from "@/lib/active-account";

export type PickupKeyState =
  | { state: "ready"; keyCode: string }
  | { state: "locked"; unlockAt: string }
  | { state: "unavailable" };

/**
 * Schlüsselcode für die eigene Buchung – erst ab 15 Minuten vor Abholung.
 * Besitz, Status und Zeit werden serverseitig geprüft; vorher wird nie ein Code geliefert.
 */
export const getPickupKeyCode = createServerFn({ method: "POST" })
  .middleware([requireActiveAccount])
  .inputValidator((d: { bookingId: string }) => {
    if (!d || typeof d.bookingId !== "string" || !/^[0-9a-f-]{36}$/i.test(d.bookingId)) throw new Error("Ungültige Buchung");
    return d;
  })
  .handler(async ({ data, context }): Promise<PickupKeyState> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pickupKeyDecision } = await import("@/lib/pickup-key.server");
    const { data: b } = await supabaseAdmin
      .from("bookings")
      .select("user_id, status, start_date, start_hour, vehicle_plate")
      .eq("id", data.bookingId)
      .maybeSingle();
    const decision = pickupKeyDecision(b, context.userId, Date.now());
    if (decision.state !== "due") return decision;
    const { data: v } = await supabaseAdmin.from("vehicles").select("id").eq("plate", b!.vehicle_plate).maybeSingle();
    if (!v?.id) return { state: "unavailable" };
    const { data: k } = await supabaseAdmin.from("vehicle_key_codes").select("key_code").eq("vehicle_id", v.id).maybeSingle();
    return k?.key_code ? { state: "ready", keyCode: k.key_code } : { state: "unavailable" };
  });
