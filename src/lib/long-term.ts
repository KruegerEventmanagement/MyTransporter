/**
 * Langzeitmiete – reine Preislogik.
 *
 * Marktorientiertes Ankermodell: Für jede Fahrzeugklasse sind Zielpreise für
 * 7, 30, 45 und 60 Miettage hinterlegt. Zwischen den Ankern wird tagesgenau
 * linear interpoliert, damit es keine Preissprünge gibt. Über 60 Tage gilt der
 * effektive 60-Tage-Tagespreis, der Preis pro Tag steigt also nie wieder.
 *
 * Der 7-Tage-Anker leitet sich weiterhin aus dem zentralen Wochenmietpreis
 * (booking-rules.ts) minus 10 % ab, damit Tarifänderungen automatisch mitziehen.
 * Die Kaution bleibt immer unberührt und wird nicht rabattiert.
 */

import { DEPOSIT_EUR, getPlanById, type VehicleClass } from "@/lib/booking-rules";

export const LONG_TERM_MIN_DAYS = 7;
/** Rabatt, der bei genau 7 Tagen gegenüber dem Wochenpreis gilt. */
export const LONG_TERM_WEEK_DISCOUNT_PERCENT = 10;

/** Ziel-Ankerpreise (Mietpreis in Euro, ohne Kaution) je Fahrzeugklasse. */
export const LONG_TERM_ANCHORS: Record<VehicleClass, Record<30 | 45 | 60, number>> = {
  l1h1: { 30: 999, 45: 1499, 60: 1899 },
  l4h2: { 30: 1399, 45: 1999, 60: 2599 },
  l5h2: { 30: 1699, 45: 2399, 60: 3099 },
};

/** Inklusiv-Kilometer je 30 Miettage. */
export const LONG_TERM_FREE_KM_PER_30_DAYS = 4000;
/** Mehrkilometer-Satz (Wochen-/Langzeitniveau) in Euro pro km. */
export const LONG_TERM_EXTRA_KM_EUR = 0.29;

/** Inklusiv-Kilometer für eine Anzahl Miettage (proportional, auf ganze km gerundet). */
export function longTermFreeKm(days: number): number {
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.round((LONG_TERM_FREE_KM_PER_30_DAYS / 30) * days);
}

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
  return Math.round(eur * 100 + Number.EPSILON) / 100;
}

/** Preis-Anker der Klasse als aufsteigende Stützpunkte. */
function anchorPoints(vehicleClass: VehicleClass): Array<{ days: number; price: number }> {
  const week = roundCents(
    (weeklyBasePriceEur(vehicleClass) * (100 - LONG_TERM_WEEK_DISCOUNT_PERCENT)) / 100,
  );
  const a = LONG_TERM_ANCHORS[vehicleClass];
  return [
    { days: 7, price: week },
    { days: 30, price: a[30] },
    { days: 45, price: a[45] },
    { days: 60, price: a[60] },
  ];
}

/** Mietpreis (ohne Kaution) für eine Anzahl Miettage ab 7 Tagen. */
export function longTermPriceEur(days: number, vehicleClass: VehicleClass): number {
  const points = anchorPoints(vehicleClass);
  const last = points[points.length - 1]!;
  if (days >= last.days) {
    // Über 60 Tage: effektiver 60-Tage-Tagespreis, kein Wiederanstieg pro Tag.
    return roundCents((last.price / last.days) * days);
  }
  for (let i = 0; i < points.length - 1; i++) {
    const lo = points[i]!;
    const hi = points[i + 1]!;
    if (days >= lo.days && days <= hi.days) {
      const ratio = (days - lo.days) / (hi.days - lo.days);
      return roundCents(lo.price + (hi.price - lo.price) * ratio);
    }
  }
  return roundCents(points[0]!.price);
}

/** Dezentes Badge für runde Laufzeiten. */
export function longTermTierLabel(days: number): string | null {
  if (days === 30) return "Monatspreis";
  if (days === 45) return "1,5-Monats-Preis";
  if (days === 60) return "2-Monats-Preis";
  return null;
}

export type LongTermQuote =
  | { eligible: false; days: number | null; reason: "invalid_range" | "below_minimum" }
  | {
      eligible: true;
      days: number;
      vehicleClass: VehicleClass;
      weeklyBasePriceEur: number;
      /** Vergleichswert: Wochenpreis tagesgenau hochgerechnet (kein echter Listenpreis). */
      referencePriceEur: number;
      totalEur: number;
      savingsEur: number;
      savingsPercent: number;
      /** true bei genau 7 Tagen – dann sind es exakt 10 % gegenüber dem Wochenpreis. */
      isExactWeekDiscount: boolean;
      effectivePricePerDayEur: number;
      tierLabel: string | null;
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
  const referencePriceEur = roundCents((weekly / LONG_TERM_MIN_DAYS) * days);
  const totalEur = longTermPriceEur(days, vehicleClass);
  const savingsEur = roundCents(referencePriceEur - totalEur);

  return {
    eligible: true,
    days,
    vehicleClass,
    weeklyBasePriceEur: weekly,
    referencePriceEur,
    totalEur,
    savingsEur,
    savingsPercent: Math.round((savingsEur / referencePriceEur) * 100),
    isExactWeekDiscount: days === LONG_TERM_MIN_DAYS,
    effectivePricePerDayEur: roundCents(totalEur / days),
    tierLabel: longTermTierLabel(days),
    depositEur: DEPOSIT_EUR,
  };
}

export function formatEur(value: number): string {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
