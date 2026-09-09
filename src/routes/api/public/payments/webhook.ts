import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyWebhook, createStripeClient, type StripeEnv } from "@/lib/stripe.server";
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


/** Erkennt die Ablehnung des atomaren BEFORE-INSERT-Triggers auf bookings. */
function isVehicleConflictError(err: { message?: string; code?: string } | null): boolean {
  const msg = err?.message ?? "";
  return msg.includes("VEHICLE_UNAVAILABLE");
}

/**
 * Unique-Verletzung auf stripe_payment_intent_id: derselbe Zahlungsvorgang
 * wurde parallel/erneut verarbeitet. Idempotent behandeln, nicht erstatten.
 */
function isDuplicatePaymentError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  const msg = err.message ?? "";
  return msg.includes("bookings_stripe_payment_intent_uniq") || msg.includes("duplicate key");
}

/**
 * Zahlung ist erfolgt, aber das Fahrzeug ist belegt: idempotent erstatten und
 * Admin informieren – ohne zweite Buchung zu speichern.
 */
async function refundConflictingPayment(params: {
  env: StripeEnv;
  sessionId: string;
  paymentIntentId: string;
  userId: string;
  details: string;
}) {
  let refundId: string | null = null;
  let refundError: string | null = null;
  try {
    const stripe = createStripeClient(params.env);
    // Idempotenz: bereits vorhandene Erstattung wiederverwenden
    const existing = await stripe.refunds.list({ payment_intent: params.paymentIntentId, limit: 1 });
    refundId = existing.data[0]?.id ?? null;
    if (!refundId) {
      const refund = await stripe.refunds.create(
        {
          payment_intent: params.paymentIntentId,
          metadata: { kind: "double_booking_conflict", sessionId: params.sessionId },
        },
        { idempotencyKey: `dbl-${params.paymentIntentId}` },
      );
      refundId = refund.id;
    }
  } catch (e) {
    refundError = e instanceof Error ? e.message : String(e);
  }
  await supabaseAdmin.from("admin_notifications").insert({
    type: "booking_conflict",
    title: "Zahlung ohne Buchung – Fahrzeug war belegt",
    body:
      `Session ${params.sessionId} · PaymentIntent ${params.paymentIntentId} · ${params.details} · ` +
      (refundId
        ? `automatisch erstattet (${refundId})`
        : `ERSTATTUNG FEHLGESCHLAGEN: ${refundError ?? "unbekannt"} – bitte manuell erstatten`),
    user_id: params.userId,
  });
}

/** true ⇒ mindestens eine Folgeaktion ist temporär fehlgeschlagen (Stripe darf retryen). */
async function reconcileBooking(session: StripeCheckoutSession, env: StripeEnv): Promise<boolean> {
  const paymentIntentId = extractId(session.payment_intent ?? null);
  const customerId = extractId(session.customer ?? null);
  const paymentMethodId = extractPaymentMethodId(session.payment_intent ?? null);

  if (!paymentIntentId) {
    console.warn("[webhook] session ohne payment_intent, überspringe", session.id);
    return false;
  }

  const { reconcileBookingPostActions } = await import("@/lib/booking-actions.server");

  // Idempotenz: existiert bereits eine Buchung für diesen PaymentIntent?
  // Wichtig: NICHT einfach returnen – fehlende/fehlgeschlagene Folgeaktionen
  // dieser bestehenden Buchung werden nachgeholt (Selbstheilung bei Retry).
  const { data: existing } = await supabaseAdmin
    .from("bookings")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (existing?.id) {
    const res = await reconcileBookingPostActions(existing.id as string);
    console.log("[webhook] bestehende Buchung reconciled", existing.id, res.results);
    return res.hasFailures;
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
    return false;
  }

  // Fahrzeug-Fallback aus DB, falls Metadata nichts enthält
  let resolvedName = vehicleName;
  let resolvedPlate = vehiclePlate;
  let resolvedModel: string | null = null;
  if (resolvedPlate) {
    const { data: byPlate } = await supabaseAdmin
      .from("vehicles")
      .select("name, model, plate")
      .eq("plate", resolvedPlate)
      .maybeSingle();
    if (byPlate) {
      resolvedName = (byPlate.name as string) || resolvedName;
      resolvedModel = (byPlate.model as string | null) ?? null;
    }
  }
  if (!resolvedName || !resolvedPlate) {
    // Fallback nur, wenn es genau EIN aktives Fahrzeug gibt. Sobald weitere
    // Fahrzeuge existieren, wäre "das älteste" eine falsche Annahme und würde
    // fremde Kalender belegen – dann lieber sauber protokollieren.
    const { data: activeVehicles } = await supabaseAdmin
      .from("vehicles")
      .select("name, model, plate")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(2);
    const only = activeVehicles?.length === 1 ? activeVehicles[0] : null;
    if (only) {
      resolvedName = resolvedName ?? (only.name as string);
      resolvedPlate = resolvedPlate ?? (only.plate as string);
      resolvedModel = resolvedModel ?? ((only.model as string | null) ?? null);
    } else {
      console.error("[webhook] Fahrzeug nicht eindeutig bestimmbar", session.id, {
        hasName: !!resolvedName,
        hasPlate: !!resolvedPlate,
        activeVehicles: activeVehicles?.length ?? 0,
      });
      await supabaseAdmin.from("admin_notifications").insert({
        type: "email_failed",
        title: "Buchung ohne eindeutiges Fahrzeug",
        body: `Session ${session.id} · PaymentIntent ${paymentIntentId} · Fahrzeug fehlt in den Buchungsdaten und ist nicht eindeutig. Bitte manuell zuordnen.`,
        user_id: userId,
      });
    }
  }

  // Fahrzeugklasse steuert den Preis – aus DB-Fahrzeug, sonst aus Metadata
  const metaClass = md.vehicleClass as string | undefined;
  const vehicleClass: VehicleClass = resolvedName
    ? vehicleClassFromName(resolvedName, resolvedModel, resolvedPlate)
    : isVehicleClass(metaClass)
      ? metaClass
      : "l1h1";

  // Doppelbelegung ausschließen: verspätete/parallele Zahlung darf keine zweite
  // bestätigte Buchung für denselben Fahrzeug-Zeitraum anlegen.
  if (resolvedPlate) {
    const { findVehicleConflicts } = await import("@/lib/availability.server");
    const conflicts = await findVehicleConflicts({
      vehiclePlate: resolvedPlate,
      planId,
      startDate,
      startHour,
      ignoreHoldUserId: userId,
    });
    if (conflicts.length > 0) {
      console.error("[webhook] Doppelbelegung verhindert (Vorprüfung)", session.id, conflicts);
      await refundConflictingPayment({
        env,
        sessionId: session.id,
        paymentIntentId,
        userId,
        details:
          `${resolvedPlate} · ${startDate} ${String(startHour).padStart(2, "0")}:00 · Tarif ${planId} · ` +
          `Konflikt: ${conflicts.map((c) => `${c.source} ${c.start_at}–${c.end_at}`).join(", ")}`,
      });
      return false;
    }
  }


  const planEntry = getPlanById(planId, vehicleClass);
  const planLabel = planEntry ? planLabelWithClass(planEntry) : (md.plan ?? "Transporter-Miete");
  const planPrice = planEntry?.price ?? KM_TARIFF_MIN_EUR[vehicleClass];
  const freeKm = planEntry?.freeKm ?? 0;
  const kmPriceCents = planEntry?.extraKmCents ?? KM_TARIFF_CENTS_PER_KM;

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
    // Exactly-once: paralleler Webhook-Retry hat die Buchung schon angelegt
    // (Unique-Index auf stripe_payment_intent_id). Kein Fehler, kein Duplikat.
    if (isDuplicatePaymentError(insertError)) {
      console.log("[webhook] Buchung existiert bereits (Unique-Index), überspringe", session.id);
      return false;
    }
    // Letzte Schranke der DB (Trigger bookings_enforce_vehicle_availability_trigger):
    // Fahrzeug wurde zwischen Vorprüfung und Insert belegt → erstatten, nicht speichern.
    if (isVehicleConflictError(insertError)) {
      console.error("[webhook] Doppelbelegung durch DB-Trigger verhindert", session.id, insertError?.message);
      await refundConflictingPayment({
        env,
        sessionId: session.id,
        paymentIntentId,
        userId,
        details:
          `${resolvedPlate ?? "ohne Kennzeichen"} · ${startDate} ${String(startHour).padStart(2, "0")}:00 · ` +
          `Tarif ${planId} · ${insertError?.message ?? "VEHICLE_UNAVAILABLE"}`,
      });
      return false;
    }
    // Andere DB-Fehler NICHT als Doppelbuchung behandeln (keine Erstattung).
    console.error("[webhook] Booking-Insert fehlgeschlagen", insertError);
    await supabaseAdmin.from("admin_notifications").insert({
      type: "email_failed",
      title: "Buchungsanlage nach Zahlung fehlgeschlagen",
      body: `Session ${session.id} · PaymentIntent ${paymentIntentId} · ${insertError?.message ?? "unbekannter Fehler"}`,
      user_id: userId,
    });
    return false;
  }

  const bookingId = booking.id as string;

  // Reservierung freigeben
  await supabaseAdmin
    .from("booking_holds")
    .delete()
    .eq("user_id", userId)
    .eq("start_date", startDate)
    .eq("start_hour", startHour);

  // Alle Folgeaktionen laufen über die Action-State-Machine: genau einmal
  // pro Buchung, unabhängig voneinander, nach Fehlern retrybar.
  const res = await reconcileBookingPostActions(bookingId);
  console.log("[webhook] Folgeaktionen", bookingId, res.results);
  if (res.hasFailures) {
    try {
      await supabaseAdmin.from("admin_notifications").insert({
        type: "email_failed",
        title: "Folgeaktionen nach Zahlung unvollständig",
        body: `Buchung ${bookingId} · ${Object.entries(res.results)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")}`,
        booking_id: bookingId,
        user_id: userId,
      });
    } catch {}
  }
  return res.hasFailures;
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
              const hasFailures = await reconcileBooking(session, env);
              if (hasFailures) {
                // Buchungsanlage ist idempotent (Unique-Index auf PaymentIntent)
                // und Folgeaktionen sind exactly-once: ein Stripe-Retry ist
                // sicher und heilt temporäre Fehler, ohne Doppelmail/-buchung.
                return new Response("post-actions incomplete", { status: 500 });
              }
            } else {
              console.log("[webhook] Session nicht bezahlt, ignoriere", session.id, session.payment_status);
            }
          } else {
            // Weitere Events (payment_intent.succeeded, invoice.*, …) hier ergänzen
            console.log("[webhook] event", event.type);
          }
        } catch (e) {
          console.error("[webhook] Handler-Fehler", e);
          // Retry zulassen: alle Schritte sind idempotent, die bezahlte Buchung
          // bleibt in jedem Fall bestehen.
          return new Response("handler error", { status: 500 });
        }
        return Response.json({ received: true });

      },
    },
  },
});