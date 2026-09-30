/**
 * Anfrage-Rechner: ein Richtpreis für beliebige Zeiträume.
 *
 * 1–6 Miettage → passender vorhandener Standardtarif aus booking-rules.ts
 * (kein Langzeitrabatt, keine Km-Gutschrift). Ab 7 Miettagen → bestehendes
 * Langzeitmodell aus long-term.ts. Alle Sätze kommen zentral aus Klasse + Tarif.
 */
import { DEPOSIT_EUR, planCatalog, type PlanEntry, type VehicleClass } from "@/lib/booking-rules";
import {
  LONG_TERM_MAX_KM,
  LONG_TERM_MIN_DAYS,
  quoteLongTermWithKm,
  rentalDaysFromDateTimes,
  rentalMinutesFromDateTimes,
} from "@/lib/long-term";

export type RentalQuoteInput = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  desiredKm: number;
};

export type RentalQuote =
  | { ok: false; reason: "invalid_range" | "invalid_km" }
  | {
      ok: true;
      kind: "standard" | "long_term";
      vehicleClass: VehicleClass;
      days: number;
      planId: string | null;
      planLabel: string;
      basePriceEur: number;
      includedKm: number;
      desiredKm: number;
      /** km über dem Inklusivkontingent. */
      extraKm: number;
      /** Standard: voraussichtliche Mehrkilometer bei Rückgabe · Langzeit: hinzugewähltes Kontingent (Staffel). */
      extraKmCostEur: number;
      /** Nur Standard: Satz, mit dem die voraussichtlichen Mehr-km gerechnet sind. */
      extraKmRateEur: number | null;
      creditEur: number;
      totalEur: number;
      pricePerDayEur: number;
      /** km, ab denen bei Rückgabe der Mehrkilometersatz gilt. */
      contractKm: number;
      /** Vertraglicher Mehrkilometersatz bei Rückgabe. */
      returnExtraKmEur: number;
      depositEur: number;
    };

const round = (v: number) => Math.round(v * 100 + Number.EPSILON) / 100;

function standardCandidates(days: number, minutes: number, vehicleClass: VehicleClass): PlanEntry[] {
  const cat = planCatalog(vehicleClass);
  if (days === 1) {
    return cat.filter((p) => p.days === 1 && p.durationHours * 60 >= Math.min(minutes, 24 * 60));
  }
  return cat.filter((p) => p.days === days);
}

export function quoteRental(input: RentalQuoteInput, vehicleClass: VehicleClass): RentalQuote {
  const { startDate, startTime, endDate, endTime, desiredKm } = input;
  const minutes = rentalMinutesFromDateTimes(startDate, startTime, endDate, endTime);
  const days = rentalDaysFromDateTimes(startDate, startTime, endDate, endTime);
  if (minutes === null || days === null) return { ok: false, reason: "invalid_range" };
  if (typeof desiredKm !== "number" || !Number.isFinite(desiredKm) || desiredKm < 0 || desiredKm > LONG_TERM_MAX_KM) {
    return { ok: false, reason: "invalid_km" };
  }
  const km = Math.round(desiredKm);

  if (days >= LONG_TERM_MIN_DAYS) {
    const q = quoteLongTermWithKm(days, vehicleClass, km);
    if (!q.eligible) return { ok: false, reason: "invalid_range" };
    return {
      ok: true,
      kind: "long_term",
      vehicleClass,
      days,
      planId: null,
      planLabel: `Langzeitmiete ${days} Tage`,
      basePriceEur: q.basePriceEur,
      includedKm: q.includedKm,
      desiredKm: km,
      extraKm: q.extraKm,
      extraKmCostEur: q.extraKmCostEur,
      extraKmRateEur: null,
      creditEur: q.creditEur,
      totalEur: q.totalEur,
      pricePerDayEur: q.effectivePricePerDayEur,
      // Langzeit: angefragtes Kontingent = Wunschkilometer (auch unter der Grundtarifbasis).
      contractKm: km,
      returnExtraKmEur: q.returnExtraKmEur,
      depositEur: DEPOSIT_EUR,
    };
  }

  const candidates = standardCandidates(days, minutes, vehicleClass);
  if (candidates.length === 0) return { ok: false, reason: "invalid_range" };
  const costed = candidates.map((p) => {
    const extraKm = Math.max(0, km - p.freeKm);
    const extraCost = round((extraKm * p.extraKmCents) / 100);
    return { p, extraKm, extraCost, total: round(p.price + extraCost) };
  });
  costed.sort((a, b) => a.total - b.total || b.p.freeKm - a.p.freeKm);
  const best = costed[0]!;
  const rate = best.p.extraKmCents / 100;
  return {
    ok: true,
    kind: "standard",
    vehicleClass,
    days,
    planId: best.p.id,
    planLabel: best.p.label,
    basePriceEur: best.p.price,
    includedKm: best.p.freeKm,
    desiredKm: km,
    extraKm: best.extraKm,
    extraKmCostEur: best.extraCost,
    extraKmRateEur: rate,
    creditEur: 0,
    totalEur: best.total,
    pricePerDayEur: round(best.total / days),
    contractKm: best.p.freeKm,
    returnExtraKmEur: rate,
    depositEur: DEPOSIT_EUR,
  };
}
