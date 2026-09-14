/**
 * Langzeitmiete – reine Preislogik.
 *
 * Basis ist immer der aktuelle 7-Tage-Wochenmietpreis aus der zentralen
 * Preisquelle (booking-rules.ts). Tarifänderungen ziehen damit automatisch mit.
 *
 * Rechenweg: Wochenpreis / 7 = Tagespreis · × echte Miettage = Normalpreis
 * · − 10 % Langzeit-Rabatt = Mietpreis. Die Kaution bleibt unberührt.
 */

import { DEPOSIT_EUR, getPlanById, type VehicleClass } from "@/lib/booking-rules";

export const LONG_TERM_MIN_DAYS = 7;
export const LONG_TERM_DISCOUNT_PERCENT = 10;

/** Wochenpreis (7 Tage) der Fahrzeugklasse in Euro. */
export function weeklyBasePriceEur(vehicleClass: VehicleClass): number {
  const plan = getPlanById("multi_7d", vehicleClass);
  if (!plan) throw new Error("7-Tage-Tarif nicht gefunden");
  return plan.price;
}

/** Volle Miettage zwischen zwei ISO-Daten (YYYY-MM-DD); null bei ungültiger Eingabe. */
export function rentalDaysBetween(startIso: string, endIso: string): number | null {
  const isIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? "");
  if (!isIso(startIso) || !isIso(endIso)) return null;
  const start = Date.parse(`${startIso}T00:00:00Z`);
  const end = Date.parse(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const days = Math.round((end - start) / 86_400_000);
  return days > 0 ? days : null;
}

/** Kaufmännisch auf Cent runden. */
function roundCents(eur: number): number {
  return Math.round(eur * 100) / 100;
}

export type LongTermQuote =
  | { eligible: false; days: number | null; reason: "invalid_range" | "below_minimum" }
  | {
      eligible: true;
      days: number;
      vehicleClass: VehicleClass;
      weeklyBasePriceEur: number;
      pricePerDayEur: number;
      normalPriceEur: number;
      discountPercent: number;
      discountEur: number;
      totalEur: number;
      effectivePricePerDayEur: number;
      depositEur: number;
    };

/** Langzeitpreis für einen Zeitraum ab 7 Tagen. */
export function quoteLongTerm(
  startIso: string,
  endIso: string,
  vehicleClass: VehicleClass,
): LongTermQuote {
  const days = rentalDaysBetween(startIso, endIso);
  if (days === null) return { eligible: false, days: null, reason: "invalid_range" };
  if (days < LONG_TERM_MIN_DAYS) return { eligible: false, days, reason: "below_minimum" };

  const weekly = weeklyBasePriceEur(vehicleClass);
  const perDay = weekly / LONG_TERM_MIN_DAYS;
  const normalPriceEur = roundCents(perDay * days);
  const discountEur = roundCents((normalPriceEur * LONG_TERM_DISCOUNT_PERCENT) / 100);
  const totalEur = roundCents(normalPriceEur - discountEur);

  return {
    eligible: true,
    days,
    vehicleClass,
    weeklyBasePriceEur: weekly,
    pricePerDayEur: roundCents(perDay),
    normalPriceEur,
    discountPercent: LONG_TERM_DISCOUNT_PERCENT,
    discountEur,
    totalEur,
    effectivePricePerDayEur: roundCents(totalEur / days),
    depositEur: DEPOSIT_EUR,
  };
}

export function formatEur(value: number): string {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
