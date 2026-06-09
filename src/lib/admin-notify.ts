import { supabase } from "@/integrations/supabase/client";

/**
 * Erzeugt eine Admin-Benachrichtigung. Schluckt Fehler still -
 * darf den eigentlichen User-Flow nie blockieren.
 */
export async function notifyAdmin(args: {
  type:
    | "booking_created"
    | "trip_started"
    | "trip_returning"
    | "photo_uploaded"
    | "tank_receipt";
  title: string;
  body?: string;
  bookingId?: string;
  userId?: string;
}) {
  try {
    await supabase.from("admin_notifications").insert({
      type: args.type,
      title: args.title,
      body: args.body ?? null,
      booking_id: args.bookingId ?? null,
      user_id: args.userId ?? null,
    });
  } catch (e) {
    console.warn("notifyAdmin failed", e);
  }
}