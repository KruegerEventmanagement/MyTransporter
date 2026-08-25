import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyWebhook, type StripeEnv } from "@/lib/stripe.server";
import {
  getPlanById,
  planLabelWithClass,
  vehicleClassFromName,
  isVehicleClass,
  KM_TARIFF_CENTS_PER_KM,
  KM_TARIFF_MIN_EUR,
  type VehicleClass,
} from "@/lib/booking-rules";
import { buildAddonSnapshot } from "@/lib/addons";
import { sendBookingConfirmation, sendAdminBookingNotification } from "@/lib/booking-emails.functions";

type StripeCheckoutSession = {
  id: string;
  payment_status?: string;
  customer?: string | { id: string } | null;
  payment_intent?: string | { id: string; payment_method?: string | { id: string } | null } | null;
  client_reference_id?: string | null;
  customer_details?: { email?: string | null } | null;
  metadata?: Record<string, string> | null;
};

function extractId(x: unknown): string | null {
  if (!x) return null;
  if (typeof x === "string") return x;
  if (typeof x === "object" && x !== null && "id" in x && typeof (x as { id: unknown }).id === "string") {
    return (x as { id: string }).id;
  }
  return null;
}

function extractPaymentMethodId(pi: StripeCheckoutSession["payment_intent"]): string | null {
  if (!pi || typeof pi === "string") return null;
  return extractId(pi.payment_method ?? null);
}

async function reconcileBooking(session: StripeCheckoutSession) {
  const paymentIntentId = extractId(session.payment_intent ?? null);
  const customerId = extractId(session.customer ?? null);
  const paymentMethodId = extractPaymentMethodId(session.payment_intent ?? null);

  if (!paymentIntentId) {
    console.warn("[webhook] session ohne payment_intent, überspringe", session.id);
    return;
  }

  // Idempotenz: existiert bereits eine Buchung für diesen PaymentIntent?
  const { data: existing } = await supabaseAdmin
    .from("bookings")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (existing?.id) {
    return;
  }

  const md = session.metadata ?? {};
  const userId = (md.userId as string | undefined) ?? session.client_reference_id ?? null;
  const planId = (md.planId as string | undefined) ?? null;
  const startDate = (md.startDate as string | undefined) ?? null;
  const startHourRaw = md.startHour as string | undefined;
  const startHour = startHourRaw != null ? Number(startHourRaw) : NaN;
  const vehicleName = (md.vehicleName as string | undefined) ?? null;
  const vehiclePlate = (md.vehiclePlate as string | undefined) ?? null;
  const addonIds = (md.addonIds as string | undefined)?.split(",").filter(Boolean) ?? [];

  if (!userId || !planId || !startDate || !Number.isFinite(startHour)) {
    console.error("[webhook] Metadata unvollständig für Session", session.id, md);
    await supabaseAdmin.from("admin_notifications").insert({
      type: "email_failed",
      title: "Zahlung ohne Buchungsdaten",
      body: `Session ${session.id} · PaymentIntent ${paymentIntentId} · fehlende Metadata (${Object.keys(md).join(",")}). Bitte manuell prüfen.`,
    });
    return;
  }

  const planEntry = getPlanById(planId);
  const planLabel = planEntry?.label ?? md.plan ?? "Transporter-Miete";
  const planPrice = planEntry?.price ?? 0;
  const freeKm = planEntry?.freeKm ?? 0;
  const kmPriceCents = planEntry?.extraKmCents ?? 90;

  // Fahrzeug-Fallback aus DB, falls Metadata nichts enthält
  let resolvedName = vehicleName;
  let resolvedPlate = vehiclePlate;
  if (!resolvedName || !resolvedPlate) {
    const { data: activeVehicle } = await supabaseAdmin
      .from("vehicles")
      .select("name, plate")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (activeVehicle) {
      resolvedName = resolvedName ?? (activeVehicle.name as string);
      resolvedPlate = resolvedPlate ?? (activeVehicle.plate as string);
    }
  }

  const addons = buildAddonSnapshot(addonIds);
  const addonsTotalCents = addons.reduce((s, a) => s + a.price_cents, 0);
  const pickupCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { data: booking, error: insertError } = await supabaseAdmin
    .from("bookings")
    .insert({
      user_id: userId,
      plan_id: planId,
      plan_label: planLabel,
      plan_price: planPrice,
      start_date: startDate,
      start_hour: startHour,
      pickup_code: pickupCode,
      status: "paid",
      free_km: freeKm,
      km_price_cents: kmPriceCents,
      stripe_customer_id: customerId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_payment_method_id: paymentMethodId,
      ...(resolvedName ? { vehicle_name: resolvedName } : {}),
      ...(resolvedPlate ? { vehicle_plate: resolvedPlate } : {}),
      addons,
      addons_total_cents: addonsTotalCents,
    })
    .select("id")
    .single();

  if (insertError || !booking) {
    console.error("[webhook] Booking-Insert fehlgeschlagen", insertError);
    await supabaseAdmin.from("admin_notifications").insert({
      type: "email_failed",
      title: "Buchungsanlage nach Zahlung fehlgeschlagen",
      body: `Session ${session.id} · PaymentIntent ${paymentIntentId} · ${insertError?.message ?? "unbekannter Fehler"}`,
      user_id: userId,
    });
    return;
  }

  const bookingId = booking.id as string;

  // Reservierung freigeben
  await supabaseAdmin
    .from("booking_holds")
    .delete()
    .eq("user_id", userId)
    .eq("start_date", startDate)
    .eq("start_hour", startHour);

  await supabaseAdmin.from("admin_notifications").insert({
    type: "booking_created",
    title: "Neue Buchung",
    body: `${planLabel} · Start ${startDate} ${String(startHour).padStart(2, "0")}:00 · Code ${pickupCode}`,
    booking_id: bookingId,
    user_id: userId,
  });

  // E-Mails still im Hintergrund — Fehler nur loggen, Webhook liefert 200
  try {
    await sendBookingConfirmation({ data: { bookingId } });
  } catch (e) {
    console.warn("[webhook] Bestätigungs-Mail fehlgeschlagen", e);
  }
  try {
    await sendAdminBookingNotification({ data: { bookingId } });
  } catch (e) {
    console.warn("[webhook] Admin-Benachrichtigung fehlgeschlagen", e);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("[webhook] ungültiges env-Query", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        const env: StripeEnv = rawEnv;

        let event: { id: string; type: string; data: { object: unknown } };
        try {
          event = await verifyWebhook(request, env);
        } catch (e) {
          console.error("[webhook] Signaturprüfung fehlgeschlagen", e);
          return new Response("Webhook error", { status: 400 });
        }

        try {
          if (event.type === "checkout.session.completed") {
            const session = event.data.object as StripeCheckoutSession;
            if (session.payment_status === "paid") {
              await reconcileBooking(session);
            } else {
              console.log("[webhook] Session nicht bezahlt, ignoriere", session.id, session.payment_status);
            }
          } else {
            // Weitere Events (payment_intent.succeeded, invoice.*, …) hier ergänzen
            console.log("[webhook] event", event.type);
          }
        } catch (e) {
          console.error("[webhook] Handler-Fehler", e);
          // Trotzdem 200 zurückgeben — Stripe würde sonst 3 Tage lang retryen;
          // Fehler landen in admin_notifications zur manuellen Prüfung.
        }
        return Response.json({ received: true });
      },
    },
  },
});