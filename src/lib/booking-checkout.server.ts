/**
 * Produktionslogik der Buchungs-Checkout-Serverfunktion (aus dem Handler
 * ausgelagert, damit Tests den echten Ablauf mit gemocktem Stripe/Backend prüfen).
 * Preise, Klasse und Kilometerpaket werden ausschließlich hier berechnet.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";
import {
  getPlanById,
  planLabelWithClass,
  vehicleClassFromName,
  isVehicleClass,
  KM_TARIFF_CENTS_PER_KM,
  KM_TARIFF_MIN_EUR,
  VEHICLE_CLASS_SHORT_LABEL,
  type VehicleClass,
  KM_CATALOG_VERSION,
  checkoutKmCatalogError,
} from "@/lib/booking-rules";
import { resolveAddonSelection } from "@/lib/addons";
import { customKmLabel, customKmMetadata, quoteCustomKm, type SnapshotAddon } from "@/lib/custom-km";

export const DEPOSIT_CENTS = 200_00;
export const CUSTOM_KM_VEHICLE_ERROR =
  "Das gewählte Fahrzeug konnte nicht eindeutig bestätigt werden. Bitte Seite neu laden und das Fahrzeug erneut wählen.";

export type BookingCheckoutInput = {
  plan: string;
  customerEmail?: string;
  userId?: string;
  returnUrl: string;
  environment: StripeEnv;
  addonIds?: string[];
  vehiclePlate?: string | null;
  vehicleName?: string | null;
  vehicleClass?: VehicleClass;
  startDate?: string;
  startHour?: number;
  couponCode?: string | null;
  kmCatalog?: string;
  customKm?: number | null;
};

type Ctx = { supabase: { from: (t: string) => any }; userId: string };
export type CheckoutSessionResult = { clientSecret: string } | { error: string };

const REQUIRED_DOC_TYPES = ["id_front", "id_back", "license_front", "license_back"] as const;

/** Klasse aus DB-Fahrzeug; ohne Paket wie bisher mit Fallback. */
async function resolveVehicleClass(plate?: string | null, name?: string | null, hint?: unknown): Promise<VehicleClass> {
  if (plate) {
    const { data } = await supabaseAdmin.from("vehicles").select("name, model, plate").eq("plate", plate).maybeSingle();
    if (data) return vehicleClassFromName(data.name, data.model, data.plate);
  }
  if (name) return vehicleClassFromName(name);
  if (isVehicleClass(hint)) return hint;
  return "l1h1";
}

/** Mit Kilometerpaket: genau EIN aktives DB-Fahrzeug mit diesem Kennzeichen, sonst null. */
async function strictVehicleClass(plate?: string | null): Promise<VehicleClass | null> {
  if (!plate) return null;
  const { data, error } = await supabaseAdmin
    .from("vehicles")
    .select("name, model, plate")
    .eq("plate", plate)
    .eq("is_active", true)
    .limit(2);
  if (error || !Array.isArray(data) || data.length !== 1) return null;
  const v = data[0] as { name: string; model: string | null; plate: string };
  return vehicleClassFromName(v.name, v.model, v.plate);
}

export async function runBookingCheckout(data: BookingCheckoutInput, context: Ctx): Promise<CheckoutSessionResult> {
  const catalogError = checkoutKmCatalogError(data.kmCatalog);
  if (catalogError) return { error: catalogError };
  try {
    const { data: docs } = await context.supabase.from("user_documents").select("doc_type").eq("user_id", context.userId).is("deleted_by_user_at", null).is("removed_from_account_at", null);
    const have = new Set((docs ?? []).map((d: { doc_type: string }) => d.doc_type));
    if (REQUIRED_DOC_TYPES.some((t) => !have.has(t))) {
      return { error: "Bitte zuerst Ausweis und Führerschein hochladen, bevor du bezahlen kannst." };
    }

    const planId = data.plan.startsWith("rent_") ? data.plan.slice(5) : data.plan;
    if (data.startDate && typeof data.startHour === "number") {
      let holdQuery = supabaseAdmin
        .from("booking_holds")
        .select("id, expires_at, plan_id, vehicle_plate")
        .eq("user_id", context.userId)
        .eq("start_date", data.startDate)
        .eq("start_hour", data.startHour)
        .eq("plan_id", planId)
        .gt("expires_at", new Date().toISOString());
      if (data.vehiclePlate) holdQuery = holdQuery.eq("vehicle_plate", data.vehiclePlate);
      const { data: holds } = await holdQuery.limit(1);
      if (!holds || holds.length === 0) {
        return { error: "Deine 15-Minuten-Reservierung ist abgelaufen. Bitte wähle dein Zeitfenster neu." };
      }
      const { findVehicleConflicts, conflictMessage } = await import("@/lib/availability.server");
      const conflicts = await findVehicleConflicts({
        vehiclePlate: data.vehiclePlate ?? "",
        planId,
        startDate: data.startDate,
        startHour: data.startHour,
        ignoreHoldUserId: context.userId,
      });
      if (conflicts.length > 0) return { error: conflictMessage(conflicts) };
    }

    const wantsKm = data.customKm != null;
    let vehicleClass: VehicleClass;
    if (wantsKm) {
      const strict = await strictVehicleClass(data.vehiclePlate);
      if (!strict) return { error: CUSTOM_KM_VEHICLE_ERROR };
      vehicleClass = strict;
    } else {
      vehicleClass = await resolveVehicleClass(data.vehiclePlate, data.vehicleName, data.vehicleClass);
    }

    const stripe = createStripeClient(data.environment);
    const planEntry = getPlanById(planId, vehicleClass);
    const plan = planEntry
      ? { rent: planEntry.price * 100, label: `Transporter-Miete · ${planLabelWithClass(planEntry)}` }
      : {
          rent: KM_TARIFF_MIN_EUR[vehicleClass] * 100,
          label: `Transporter-Miete · ${VEHICLE_CLASS_SHORT_LABEL[vehicleClass]} · Kilometer-Tarif (${(KM_TARIFF_CENTS_PER_KM / 100)
            .toFixed(2)
            .replace(".", ",")} €/km, Mindestbetrag ${KM_TARIFF_MIN_EUR[vehicleClass]} €)`,
        };

    // Gutschein nur auf die Mietleistung.
    const { resolveCouponForRent } = await import("@/lib/birthday.server");
    const coupon = await resolveCouponForRent(data.couponCode, context.userId, plan.rent);
    if (!coupon.ok) return { error: coupon.reason ?? "Gutscheincode ungültig." };
    const discountCents = Math.min(coupon.discountCents ?? 0, Math.max(0, plan.rent - 100));
    const rentAfterDiscount = plan.rent - discountCents;
    const rentLabel = discountCents > 0 ? `${plan.label} · inkl. ${coupon.discountPercent} % Geburtstagsrabatt` : plan.label;

    type LineItem = { price_data: { currency: string; product_data: { name: string }; unit_amount: number }; quantity: number };
    const line_items: LineItem[] = [];
    const push = (name: string, cents: number) =>
      line_items.push({ price_data: { currency: "eur", product_data: { name }, unit_amount: cents }, quantity: 1 });
    if (rentAfterDiscount > 0) push(rentLabel, rentAfterDiscount);

    const kmQuote = wantsKm && planEntry ? quoteCustomKm(planId, vehicleClass, data.customKm!) : null;
    const kmPackage = kmQuote && kmQuote.surchargeCents > 0 ? kmQuote : null;
    if (kmPackage) push(customKmLabel(kmPackage), kmPackage.surchargeCents);

    const addonIds = data.addonIds ?? [];
    const bookedAddons: SnapshotAddon[] = [];
    for (const id of addonIds) {
      const sel = resolveAddonSelection(id);
      if (!sel) continue;
      push(sel.label, sel.priceCents);
      bookedAddons.push({ id, label: sel.label, price_cents: sel.priceCents });
    }
    push("Kaution (wird nach Rückgabe erstattet)", DEPOSIT_CENTS);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded_page",
      line_items,
      return_url: data.returnUrl,
      customer_creation: "always",
      ...(data.customerEmail && { customer_email: data.customerEmail }),
      payment_intent_data: {
        description: plan.rent > 0 ? `${plan.label} + Kaution` : "Transporter-Miete · Kaution",
        setup_future_usage: "off_session",
      },
      ...(context.userId && {
        client_reference_id: context.userId,
        metadata: {
          userId: context.userId,
          plan: data.plan,
          planId,
          vehicleClass,
          kmCatalog: KM_CATALOG_VERSION,
          ...(planEntry && {
            freeKm: String(kmPackage ? kmPackage.contractKm : planEntry.freeKm),
            kmPriceCents: String(kmPackage ? kmPackage.rateCents : planEntry.extraKmCents),
          }),
          ...(kmPackage &&
            planEntry &&
            customKmMetadata({
              planId,
              vehicleClass,
              planLabel: planLabelWithClass(planEntry),
              rentFullCents: plan.rent,
              discountCents,
              addons: bookedAddons,
              quote: kmPackage,
              depositCents: DEPOSIT_CENTS,
            })),
          ...(data.startDate && { startDate: data.startDate }),
          ...(typeof data.startHour === "number" && { startHour: String(data.startHour) }),
          ...(data.vehicleName && { vehicleName: String(data.vehicleName).slice(0, 200) }),
          ...(data.vehiclePlate && { vehiclePlate: String(data.vehiclePlate).slice(0, 50) }),
          ...(addonIds.length > 0 && { addonIds: addonIds.join(",") }),
          ...(discountCents > 0 && { couponCode: coupon.code!, discountCents: String(discountCents) }),
        },
      }),
    } as any);

    if (!session.client_secret) throw new Error("Stripe hat kein Checkout-Token zurückgegeben");
    return { clientSecret: session.client_secret };
  } catch (error) {
    return { error: getStripeErrorMessage(error) };
  }
}
