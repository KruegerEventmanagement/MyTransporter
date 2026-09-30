/**
 * Individuelles Kilometerpaket (normale Buchung) – reine, deterministische Preislogik.
 *
 * Der Kunde gibt seine GESAMT-Strecke ein. Der gebuchte Tarif (plan_id) bleibt
 * unverändert; berechnet wird ein nicht negativer Paketaufschlag:
 *   Aufschlag = günstigster Gesamtmietpreis (gleiche Dauer, gleiche Klasse,
 *               nur Tarife mit mindestens gleichem Kontingent) − ursprünglicher Mietpreis.
 * Vertragliches Kontingent = max(Wunsch-km, Kontingent des berücksichtigten Tarifs).
 * Mehrkilometer über diesem Kontingent: Satz des berücksichtigten Tarifs.
 * Katalogpreise und -sätze kommen ausschließlich aus booking-rules.ts.
 */
import { getPlanById, planCatalog, type PlanEntry, type VehicleClass } from "@/lib/booking-rules";
import { LONG_TERM_MAX_KM } from "@/lib/long-term";

/** Version der Paketberechnung (Stripe-Metadata). */
export const CUSTOM_KM_VERSION = "ckm-1";
export const CUSTOM_KM_ADDON_ID = "km_paket";
export const CUSTOM_KM_MAX = LONG_TERM_MAX_KM;

export type CustomKmParse = { ok: true; value: number } | { ok: false; error: string };

/** Strenge Eingabeprüfung: nur ganze, nicht negative km bis zur Obergrenze. */
export function parseCustomKmInput(raw: unknown): CustomKmParse {
  const s = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (s === "") return { ok: false, error: "Bitte gewünschte Gesamtkilometer eingeben." };
  if (!/^\d+$/.test(s)) return { ok: false, error: "Bitte nur ganze Kilometer ohne Komma oder Minus eingeben." };
  const v = Number(s);
  if (!Number.isSafeInteger(v)) return { ok: false, error: "Ungültige Kilometerzahl." };
  if (v > CUSTOM_KM_MAX) return { ok: false, error: `Maximal ${CUSTOM_KM_MAX.toLocaleString("de-DE")} km möglich.` };
  return { ok: true, value: v };
}

export type CustomKmQuote = {
  originalPlanId: string;
  originalPriceCents: number;
  baseFreeKm: number;
  desiredKm: number;
  /** Tarif, dessen Preis/Kontingent im Aufschlag berücksichtigt wurde. */
  consideredPlanId: string;
  consideredPlanLabel: string;
  contractKm: number;
  surchargeCents: number;
  /** Mehrkilometersatz über dem gebuchten Kontingent (ct/km). */
  rateCents: number;
  totalRentCents: number;
};

function costCents(p: PlanEntry, km: number): number {
  return p.price * 100 + Math.max(0, km - p.freeKm) * p.extraKmCents;
}

/**
 * Paketquote für einen gebuchten Tarif. null = kein Paket möglich/nötig
 * (reiner km-Tarif oder unbekannter Tarif).
 */
export function quoteCustomKm(planId: string, vehicleClass: VehicleClass, desiredKm: number): CustomKmQuote | null {
  if (!Number.isSafeInteger(desiredKm) || desiredKm < 0 || desiredKm > CUSTOM_KM_MAX) return null;
  const orig = getPlanById(planId, vehicleClass);
  if (!orig || planId === "km") return null;
  const sameDuration = planCatalog(vehicleClass).filter(
    (p) => p.durationHours === orig.durationHours && p.days === orig.days && p.freeKm >= orig.freeKm && p.id !== orig.id,
  );
  const candidates = [orig, ...sameDuration];
  const costed = candidates.map((p) => ({ p, c: costCents(p, desiredKm) }));
  // Günstigster Gesamtpreis; bei Gleichstand mehr Inklusivkilometer.
  costed.sort((a, b) => a.c - b.c || b.p.freeKm - a.p.freeKm);
  const best = costed[0]!;
  const originalPriceCents = orig.price * 100;
  const surchargeCents = Math.max(0, best.c - originalPriceCents);
  const contractKm = Math.max(desiredKm, best.p.freeKm, orig.freeKm);
  return {
    originalPlanId: orig.id,
    originalPriceCents,
    baseFreeKm: orig.freeKm,
    desiredKm,
    consideredPlanId: best.p.id,
    consideredPlanLabel: best.p.shortLabel,
    contractKm: surchargeCents > 0 ? contractKm : orig.freeKm,
    surchargeCents,
    rateCents: surchargeCents > 0 ? best.p.extraKmCents : orig.extraKmCents,
    totalRentCents: originalPriceCents + surchargeCents,
  };
}

export function customKmLabel(q: CustomKmQuote): string {
  const via = q.consideredPlanId !== q.originalPlanId ? ` (berechnet über ${q.consideredPlanLabel})` : "";
  return `Kilometerpaket: ${q.contractKm.toLocaleString("de-DE")} km gesamt${via}`;
}

/** Stripe-Metadata (nur Zahlen/IDs, keine personenbezogenen Daten). */
export function customKmMetadata(q: CustomKmQuote): Record<string, string> {
  return {
    ckV: CUSTOM_KM_VERSION,
    ckPlan: q.originalPlanId,
    ckBaseKm: String(q.baseFreeKm),
    ckDesired: String(q.desiredKm),
    ckVia: q.consideredPlanId,
    ckContract: String(q.contractKm),
    ckSurcharge: String(q.surchargeCents),
    ckRate: String(q.rateCents),
  };
}

export type CustomKmSnapshot =
  | { kind: "none" }
  | { kind: "invalid"; reason: string }
  | { kind: "ok"; contractKm: number; rateCents: number; surchargeCents: number; addon: { id: string; label: string; price_cents: number } };

/**
 * Webhook: Snapshot aus der Session lesen – exakt die bezahlten Werte, NIE neu
 * aus dem aktuellen Katalog berechnen. Defekter Snapshot → "invalid" (prüfen).
 */
export function readCustomKmSnapshot(md: Record<string, string | undefined>, planId: string): CustomKmSnapshot {
  if (md.ckV == null) return { kind: "none" };
  if (md.ckV !== CUSTOM_KM_VERSION) return { kind: "invalid", reason: `unbekannte Version ${md.ckV}` };
  const int = (v: string | undefined) => (v != null && /^\d+$/.test(v) ? Number(v) : NaN);
  const base = int(md.ckBaseKm), desired = int(md.ckDesired), contract = int(md.ckContract);
  const surcharge = int(md.ckSurcharge), rate = int(md.ckRate);
  if (![base, desired, contract, surcharge, rate].every(Number.isSafeInteger)) return { kind: "invalid", reason: "Zahlenwerte fehlen/ungültig" };
  if (md.ckPlan !== planId) return { kind: "invalid", reason: "Tarif passt nicht zum Snapshot" };
  if (surcharge <= 0 || contract < base || contract < desired || rate <= 0) return { kind: "invalid", reason: "Werte widersprüchlich" };
  const via = md.ckVia && md.ckVia !== planId ? getPlanById(md.ckVia)?.shortLabel : null;
  return {
    kind: "ok",
    contractKm: contract,
    rateCents: rate,
    surchargeCents: surcharge,
    addon: {
      id: CUSTOM_KM_ADDON_ID,
      label: `Kilometerpaket: ${contract.toLocaleString("de-DE")} km gesamt${via ? ` (berechnet über ${via})` : ""}`,
      price_cents: surcharge,
    },
  };
}

/** Bezahltes Kilometerpaket aus einem Buchungs-Addon-Snapshot (für Storno). */
export function paidCustomKmCents(addons: unknown): number {
  if (!Array.isArray(addons)) return 0;
  return addons.reduce((s, a) => {
    const x = a as { id?: unknown; price_cents?: unknown };
    return x?.id === CUSTOM_KM_ADDON_ID && Number.isSafeInteger(x.price_cents) && (x.price_cents as number) > 0 ? s + (x.price_cents as number) : s;
  }, 0);
}

/** Zubehör, das physisch übergeben/zurückgegeben wird (ohne Kilometerpaket). */
export function isPhysicalAddon(a: { id: string }): boolean {
  return a.id !== CUSTOM_KM_ADDON_ID;
}
