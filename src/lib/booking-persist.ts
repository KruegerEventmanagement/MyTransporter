/**
 * Webhook-Persistenz: welche Preis-/Kilometerwerte eine neue Buchung bekommt.
 * Reine Produktionsfunktion (vom Webhook genutzt, direkt getestet).
 * - Session mit Kilometerpaket-Snapshot → exakt der bezahlte Snapshot, nie Katalog.
 * - Session ohne ck*-Felder → bisheriger Pfad (Katalogpreis + km-Snapshot/Legacy).
 */
import {
  getPlanById,
  planLabelWithClass,
  KM_TARIFF_MIN_EUR,
  resolveCheckoutKmSnapshot,
  type VehicleClass,
} from "@/lib/booking-rules";
import { buildAddonSnapshot } from "@/lib/addons";
import { readCustomKmSnapshot, type SnapshotAddon } from "@/lib/custom-km";

export type BookingPricing =
  | { kind: "invalid"; reason: string }
  | {
      kind: "ok";
      planLabel: string;
      planPrice: number;
      appliedDiscountCents: number;
      freeKm: number;
      kmPriceCents: number;
      addons: SnapshotAddon[];
      addonsTotalCents: number;
    };

export function resolveBookingPricing(params: {
  md: Record<string, string | undefined>;
  planId: string;
  vehicleClass: VehicleClass;
  addonIds: string[];
  couponDiscountCents: number;
  paid?: { amountTotal?: number | null; currency?: string | null };
}): BookingPricing {
  const { md, planId, vehicleClass, addonIds, couponDiscountCents, paid } = params;
  const ck = readCustomKmSnapshot(md, planId, paid ?? { amountTotal: null, currency: null });
  if (ck.kind === "invalid") return ck;
  if (ck.kind === "ok") {
    return {
      kind: "ok",
      planLabel: ck.planLabel,
      planPrice: ck.planPriceCents / 100,
      appliedDiscountCents: ck.discountCents,
      freeKm: ck.contractKm,
      kmPriceCents: ck.rateCents,
      addons: ck.addons,
      addonsTotalCents: ck.addons.reduce((s, a) => s + a.price_cents, 0),
    };
  }
  // Bisheriger Pfad (unverändert).
  const planEntry = getPlanById(planId, vehicleClass);
  const planLabel = planEntry ? planLabelWithClass(planEntry) : (md.plan ?? "Transporter-Miete");
  const planPriceFull = planEntry?.price ?? KM_TARIFF_MIN_EUR[vehicleClass];
  const appliedDiscountCents = Math.min(couponDiscountCents, Math.max(0, Math.round(planPriceFull * 100) - 100));
  const kmSnap = resolveCheckoutKmSnapshot(md, planId, vehicleClass);
  const addons = buildAddonSnapshot(addonIds);
  return {
    kind: "ok",
    planLabel,
    planPrice: Math.round(planPriceFull * 100 - appliedDiscountCents) / 100,
    appliedDiscountCents,
    freeKm: kmSnap.freeKm,
    kmPriceCents: kmSnap.kmPriceCents,
    addons,
    addonsTotalCents: addons.reduce((s, a) => s + a.price_cents, 0),
  };
}
