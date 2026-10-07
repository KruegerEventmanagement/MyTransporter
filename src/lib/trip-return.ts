import { stripExceptionKind } from "./documentation-fee";
/**
 * Rückgabe: Pflichtnachweise, Ausnahmen und Kilometerauswertung.
 * Rein und testbar; wird von UI und Server-Rückgabemeldung gemeinsam genutzt.
 * Die Mehrkilometer-Berechnung ist identisch zur bisherigen ReturnFlow-Logik.
 */
import { getPlanById, KM_TARIFF_CENTS_PER_KM, bookingFreeKm } from "./booking-rules";

export const RETURN_SIDE_TAGS = [
  "post_front",
  "post_front_right",
  "post_right",
  "post_back_right",
  "post_back",
  "post_back_left",
  "post_left",
  "post_front_left",
] as const;

export const RETURN_INTERIOR_TAG = "post_interior";
export const RETURN_ODOMETER_TAG = "post_odometer";
export const RETURN_FUEL_TAG = "post_fuel";
export const RETURN_RECEIPT_TAG = "tank_receipt";
/** v2: EIN gemeinsames Instrumentenfoto für Kilometerstand UND Tankstand. */
export const RETURN_DASHBOARD_TAG = "post_dashboard";

/** v2-Wizard: 6 Fahrzeug-/Instrumentenfotos; dazu IMMER der Tankbeleg (7 Pflichtnachweise). */
export const RETURN_V2_CORE_TAGS = ["post_front", "post_back", "post_left", "post_right", RETURN_INTERIOR_TAG, RETURN_DASHBOARD_TAG] as const;

export const EXCEPTION_COVERS_V2: Record<"photos" | "fuel" | "receipt", readonly string[]> = {
  photos: ["post_front", "post_back", "post_left", "post_right", RETURN_INTERIOR_TAG],
  fuel: [RETURN_DASHBOARD_TAG],
  receipt: [RETURN_RECEIPT_TAG],
};

/** Tankbeleg ist immer Pflicht; der Parameter bleibt nur für Signatur-Kompatibilität. */
export function requiredReturnTagsV2(_refueled?: boolean): string[] {
  return [...RETURN_V2_CORE_TAGS, RETURN_RECEIPT_TAG];
}

export interface ReturnFlowMode {
  flow: "v2";
  refueled: boolean;
}

export type ExceptionKey = "photos" | "fuel" | "receipt";

/** Welche Ausnahme welche Pflichtkategorien abdecken darf. */
export const EXCEPTION_COVERS: Record<ExceptionKey, readonly string[]> = {
  photos: [...RETURN_SIDE_TAGS, RETURN_INTERIOR_TAG, RETURN_ODOMETER_TAG],
  fuel: [RETURN_FUEL_TAG],
  receipt: [RETURN_RECEIPT_TAG],
};

export const REQUIRED_RETURN_TAGS: readonly string[] = [
  ...RETURN_SIDE_TAGS,
  RETURN_INTERIOR_TAG,
  RETURN_ODOMETER_TAG,
  RETURN_FUEL_TAG,
  RETURN_RECEIPT_TAG,
];

export const MIN_REASON_LENGTH = 10;

export type ReturnExceptions = Partial<Record<ExceptionKey, string>>;

/** Begründungstext zählt ohne die Einordnungs-Kennung ([Technisches Problem] / [Nachweis nicht bereitgestellt]). */
export function validReason(r: string | null | undefined): boolean {
  return typeof r === "string" && stripExceptionKind(r).trim().length >= MIN_REASON_LENGTH;
}

export function cleanExceptions(ex: ReturnExceptions | null | undefined): ReturnExceptions {
  const out: ReturnExceptions = {};
  for (const k of Object.keys(EXCEPTION_COVERS) as ExceptionKey[]) {
    const v = ex?.[k];
    if (validReason(v)) out[k] = v!.trim().slice(0, 500);
  }
  return out;
}

/** Fehlende Pflichtkategorien, die NICHT durch eine begründete Ausnahme gedeckt sind. */
export function missingReturnEvidence(
  confirmedTags: Iterable<string>,
  ex: ReturnExceptions | null | undefined,
  mode?: ReturnFlowMode | null,
): string[] {
  const have = new Set(confirmedTags);
  const clean = cleanExceptions(ex);
  const covered = new Set<string>();
  const covers = mode ? EXCEPTION_COVERS_V2 : EXCEPTION_COVERS;
  for (const k of Object.keys(clean) as ExceptionKey[]) covers[k].forEach((t) => covered.add(t));
  if (mode && have.has(RETURN_ODOMETER_TAG) && have.has(RETURN_FUEL_TAG)) have.add(RETURN_DASHBOARD_TAG);
  const required = mode ? requiredReturnTagsV2(mode.refueled) : REQUIRED_RETURN_TAGS;
  return required.filter((t) => !have.has(t) && !covered.has(t));
}

export interface KmEvaluation {
  driven: number | null;
  free: number;
  extra: number | null;
  chargeCents: number | null;
  pricePerKmCents: number;
  /** Grund für manuelle Prüfung; dann wird nichts berechnet. */
  reviewReason: string | null;
}

export function evaluateReturnKm(args: {
  planId: string | null | undefined;
  startKm: number | null | undefined;
  endKm: number;
  freeKm: number | null | undefined;
  kmPriceCents: number | null | undefined;
}): KmEvaluation {
  const { planId, endKm } = args;
  const plan = planId && planId !== "km" ? getPlanById(planId as never) : null;
  const free = planId === "km" ? 0 : bookingFreeKm(planId as never, args.freeKm);
  const pricePerKmCents =
    typeof args.kmPriceCents === "number"
      ? args.kmPriceCents
      : planId === "km"
        ? KM_TARIFF_CENTS_PER_KM
        : (plan?.extraKmCents ?? KM_TARIFF_CENTS_PER_KM);
  const start = typeof args.startKm === "number" ? args.startKm : null;
  // Wie report_trip_return: ohne Buchungs-Snapshot (km-Preis) keine Schätzung aus dem aktuellen Katalog.
  if (typeof args.kmPriceCents !== "number") {
    return { driven: start === null || endKm < start ? null : endKm - start, free, extra: null, chargeCents: null, pricePerKmCents, reviewReason: "Kilometerpreis der Buchung fehlt – manuelle Prüfung, keine Berechnung." };
  }
  if (start === null) {
    return { driven: null, free, extra: null, chargeCents: null, pricePerKmCents, reviewReason: "Start-Kilometerstand fehlt – manuelle Prüfung." };
  }
  if (endKm < start) {
    return {
      driven: null,
      free,
      extra: null,
      chargeCents: null,
      pricePerKmCents,
      reviewReason: `End-Kilometerstand ${endKm} ist kleiner als Start ${start} (z. B. Tacho-Anzeigefehler) – manuelle Prüfung, keine Berechnung.`,
    };
  }
  const driven = endKm - start;
  const extra = planId === "km" ? driven : Math.max(0, driven - free);
  return { driven, free, extra, chargeCents: extra * pricePerKmCents, pricePerKmCents, reviewReason: null };
}

/** Kryptografisch zufälliger 6-stelliger Rückgabecode ohne verwechselbare Zeichen. */
export function generateReturnCode(rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(rand(6), (b) => alphabet[b % alphabet.length]).join("");
}
