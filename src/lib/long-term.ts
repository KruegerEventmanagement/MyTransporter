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

import { DEPOSIT_EUR, extraKmCentsFor, getPlanById, type VehicleClass } from "@/lib/booking-rules";

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
/** Mehrkilometer-Satz bei Rückgabe (Wochen-/Langzeitniveau, L1H1) in Euro pro km. */
export const LONG_TERM_EXTRA_KM_EUR = extraKmCentsFor("l1h1", 7) / 100;

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
      /** Inklusiv-Kilometer für die Laufzeit. */
      freeKm: number;
      /** Preis je Mehrkilometer in Euro. */
      extraKmEur: number;
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
    freeKm: longTermFreeKm(days),
    extraKmEur: longTermKmConfig(vehicleClass).returnExtraKmEur,
  };
}

export function formatEur(value: number): string {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Langzeitmiete mit Uhrzeit und Wunschkilometern (Anfrage-Rechner)
// ---------------------------------------------------------------------------

/** Kulanz in Minuten, bevor ein angefangener 24-h-Block als weiterer Tag zählt. */
export const LONG_TERM_GRACE_MINUTES = 60;
/** Gestaffelter Preis für vorab hinzugewählte Kilometer über dem Inklusivkontingent. */
export const LONG_TERM_KM_TIERS: Array<{ upToExtraKm: number; eurPerKm: number }> = [
  { upToExtraKm: 1000, eurPerKm: 0.29 },
  { upToExtraKm: 5000, eurPerKm: 0.22 },
  { upToExtraKm: Infinity, eurPerKm: 0.18 },
];
/** Gutschrift je nicht benötigtem Inklusiv-km. */
export const LONG_TERM_UNUSED_KM_CREDIT_EUR = 0.05;
/** Maximale Gutschrift in Prozent des Grundpreises. */
export const LONG_TERM_MAX_CREDIT_PERCENT = 10;
/** Obergrenze der Wunschkilometer im Rechner. */
export const LONG_TERM_MAX_KM = 30000;

export type LongTermKmConfig = {
  tiers: Array<{ upToExtraKm: number; eurPerKm: number }>;
  unusedKmCreditEur: number;
  maxCreditPercent: number;
  /** Vertraglicher Mehrkilometersatz bei Rückgabe (über gebuchtes Kontingent). */
  returnExtraKmEur: number;
};

/**
 * Km-Konfiguration je Fahrzeugklasse – aktuell für alle Klassen gleich
 * (bestehende Werte unverändert). Abweichungen nur hier eintragen.
 */
export const LONG_TERM_KM_CONFIG: Record<VehicleClass, LongTermKmConfig> = {
  l1h1: { tiers: LONG_TERM_KM_TIERS, unusedKmCreditEur: LONG_TERM_UNUSED_KM_CREDIT_EUR, maxCreditPercent: LONG_TERM_MAX_CREDIT_PERCENT, returnExtraKmEur: extraKmCentsFor("l1h1", 7) / 100 },
  l4h2: { tiers: LONG_TERM_KM_TIERS, unusedKmCreditEur: LONG_TERM_UNUSED_KM_CREDIT_EUR, maxCreditPercent: LONG_TERM_MAX_CREDIT_PERCENT, returnExtraKmEur: extraKmCentsFor("l4h2", 7) / 100 },
  l5h2: { tiers: LONG_TERM_KM_TIERS, unusedKmCreditEur: LONG_TERM_UNUSED_KM_CREDIT_EUR, maxCreditPercent: LONG_TERM_MAX_CREDIT_PERCENT, returnExtraKmEur: extraKmCentsFor("l5h2", 7) / 100 },
};

export function longTermKmConfig(vehicleClass: VehicleClass): LongTermKmConfig {
  return LONG_TERM_KM_CONFIG[vehicleClass];
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Echtes Kalenderdatum YYYY-MM-DD (kein 31.02.). */
export function isRealIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v ?? "")) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
}

/** Mietdauer in Minuten aus Datum + Uhrzeit (Wandzeit); null bei ungültiger Eingabe. */
export function rentalMinutesFromDateTimes(startDate: string, startTime: string, endDate: string, endTime: string): number | null {
  if (!isRealIsoDate(startDate) || !isRealIsoDate(endDate) || !TIME_RE.test(startTime ?? "") || !TIME_RE.test(endTime ?? "")) return null;
  const s = Date.parse(`${startDate}T${startTime}:00Z`);
  const e = Date.parse(`${endDate}T${endTime}:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null;
  return (e - s) / 60_000;
}

/** Miettage aus Datum + Uhrzeit (angefangene 24-h-Blöcke, 1 h Kulanz). Wandzeit, daher sommerzeitneutral. */
export function rentalDaysFromDateTimes(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): number | null {
  if (!isRealIsoDate(startDate) || !isRealIsoDate(endDate) || !TIME_RE.test(startTime ?? "") || !TIME_RE.test(endTime ?? "")) return null;
  const s = Date.parse(`${startDate}T${startTime}:00Z`);
  const e = Date.parse(`${endDate}T${endTime}:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null;
  const minutes = (e - s) / 60_000 - LONG_TERM_GRACE_MINUTES;
  return Math.max(1, Math.ceil(minutes / 1440));
}

/** Aufpreis für Zusatzkilometer nach Staffel. */
export function extraKmCostEur(extraKm: number, vehicleClass: VehicleClass = "l1h1"): number {
  if (!Number.isFinite(extraKm)) return 0;
  let rest = Math.max(0, Math.round(extraKm));
  let prevCap = 0;
  let total = 0;
  for (const tier of longTermKmConfig(vehicleClass).tiers) {
    const span = tier.upToExtraKm - prevCap;
    const used = Math.min(rest, span);
    total += used * tier.eurPerKm;
    rest -= used;
    prevCap = tier.upToExtraKm;
    if (rest <= 0) break;
  }
  return roundCents(total);
}

export type LongTermKmQuote =
  | { eligible: false; days: number | null; reason: "invalid_range" | "below_minimum" }
  | {
      eligible: true;
      days: number;
      vehicleClass: VehicleClass;
      desiredKm: number;
      includedKm: number;
      basePriceEur: number;
      extraKm: number;
      extraKmCostEur: number;
      creditEur: number;
      totalEur: number;
      effectivePricePerDayEur: number;
      /** Vertraglicher Satz je km über dem gebuchten Kontingent (inklusive + hinzugewählt). */
      returnExtraKmEur: number;
      depositEur: number;
    };

/** Richtpreis für Tage + Wunschkilometer. */
export function quoteLongTermWithKm(
  days: number | null,
  vehicleClass: VehicleClass,
  desiredKm: number,
): LongTermKmQuote {
  if (days === null || !Number.isFinite(days)) return { eligible: false, days: null, reason: "invalid_range" };
  if (days < LONG_TERM_MIN_DAYS) return { eligible: false, days, reason: "below_minimum" };
  const km = Math.max(0, Math.round(Number.isFinite(desiredKm) ? desiredKm : 0));
  const basePriceEur = longTermPriceEur(days, vehicleClass);
  const includedKm = longTermFreeKm(days);
  const extraKm = Math.max(0, km - includedKm);
  const cfg = longTermKmConfig(vehicleClass);
  const extra = extraKmCostEur(extraKm, vehicleClass);
  const unused = Math.max(0, includedKm - km);
  const creditEur = roundCents(
    Math.min(unused * cfg.unusedKmCreditEur, (basePriceEur * cfg.maxCreditPercent) / 100),
  );
  const totalEur = roundCents(basePriceEur + extra - creditEur);
  return {
    eligible: true,
    days,
    vehicleClass,
    desiredKm: km,
    includedKm,
    basePriceEur,
    extraKm,
    extraKmCostEur: extra,
    creditEur,
    totalEur,
    effectivePricePerDayEur: roundCents(totalEur / days),
    returnExtraKmEur: cfg.returnExtraKmEur,
    depositEur: DEPOSIT_EUR,
  };
}
