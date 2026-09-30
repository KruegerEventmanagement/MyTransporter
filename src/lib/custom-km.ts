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
/** ckm-1 (nie veröffentlicht, ohne vollständigen Preis-Snapshot) wird als ungültig abgewiesen. */
export const CUSTOM_KM_VERSION = "ckm-2";
export const CUSTOM_KM_ADDON_ID = "km_paket";
export const CUSTOM_KM_MAX = LONG_TERM_MAX_KM;

export type CustomKmParse = { ok: true; value: number } | { ok: false; error: string };

/** Strenge Eingabeprüfung: nur ganze, nicht negative km bis zur Obergrenze. */
export function parseCustomKmInput(raw: unknown): CustomKmParse {
  const s = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (s === "") return { ok: false, error: "Bitte gewünschte Gesamtkilometer eingeben." };
  // Hinweis: Die Buchungsmaske behandelt leere Eingabe vorher als „kein Paket“.
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

export type SnapshotAddon = { id: string; label: string; price_cents: number };

/** Vollständiger serverseitiger Preis-Snapshot einer Checkout-Session mit Kilometerpaket. */
export type CustomKmPriceSnapshot = {
  planId: string;
  vehicleClass: VehicleClass;
  planLabel: string;
  rentFullCents: number;
  discountCents: number;
  /** Physisches Zubehör, exakt wie bezahlt. */
  addons: SnapshotAddon[];
  quote: CustomKmQuote;
  depositCents: number;
};

const MD_MAX = 480; // Stripe: max 500 Zeichen je Wert
const MAX_SNAPSHOT_ADDONS = 5;
const cleanLabel = (s: string) => s.replace(/[|\n\r]/g, " ").slice(0, 200);

export function snapshotTotalCents(s: { rentFullCents: number; discountCents: number; addons: SnapshotAddon[]; quote: { surchargeCents: number }; depositCents: number }): number {
  return s.rentFullCents - s.discountCents + s.quote.surchargeCents + s.addons.reduce((t, a) => t + a.price_cents, 0) + s.depositCents;
}

/**
 * Stripe-Metadata (nur Zahlen/IDs/Tariflabels, keine personenbezogenen Daten).
 * Kurze Einzel-Keys, damit 50 Keys / 500 Zeichen nie überschritten werden.
 */
export function customKmMetadata(s: CustomKmPriceSnapshot): Record<string, string> {
  const q = s.quote;
  if (s.addons.length > MAX_SNAPSHOT_ADDONS) throw new Error("Zu viele Zusatzpakete");
  const md: Record<string, string> = {
    ckV: CUSTOM_KM_VERSION,
    ckPlan: q.originalPlanId,
    ckCls: s.vehicleClass,
    ckLbl: cleanLabel(s.planLabel),
    ckRentFull: String(s.rentFullCents),
    ckDisc: String(s.discountCents),
    ckBaseKm: String(q.baseFreeKm),
    ckDesired: String(q.desiredKm),
    ckVia: q.consideredPlanId,
    ckViaLbl: cleanLabel(q.consideredPlanLabel),
    ckContract: String(q.contractKm),
    ckSurcharge: String(q.surchargeCents),
    ckRate: String(q.rateCents),
    ckDep: String(s.depositCents),
    ckAddN: String(s.addons.length),
    ckTot: String(snapshotTotalCents(s)),
  };
  s.addons.forEach((a, i) => {
    md[`ckA${i}`] = `${a.price_cents}|${a.id.slice(0, 60)}|${cleanLabel(a.label)}`.slice(0, MD_MAX);
  });
  return md;
}

export type CustomKmSnapshot =
  | { kind: "none" }
  | { kind: "invalid"; reason: string }
  | {
      kind: "ok";
      planLabel: string;
      /** Bezahlte Grundmiete nach Rabatt (Cent). */
      planPriceCents: number;
      discountCents: number;
      contractKm: number;
      rateCents: number;
      surchargeCents: number;
      depositCents: number;
      totalCents: number;
      /** Physisches Zubehör + Kilometerpaket, exakt wie bezahlt. */
      addons: SnapshotAddon[];
      addon: SnapshotAddon;
    };

const intOf = (v: string | undefined) => (v != null && /^\d{1,12}$/.test(v) ? Number(v) : NaN);

/**
 * Webhook: Snapshot aus der (signaturgeprüften) Session lesen – exakt die bezahlten
 * Werte, NIE aus dem aktuellen Katalog. Teil-/Fremd-/Alt-Snapshot → "invalid".
 * Ohne jedes ck*-Feld → "none" (bisheriger Legacy-Pfad).
 */
export function readCustomKmSnapshot(
  md: Record<string, string | undefined>,
  planId: string,
  paid?: { amountTotal?: number | null; currency?: string | null },
): CustomKmSnapshot {
  const hasAny = Object.keys(md).some((k) => /^ck[A-Z]/.test(k));
  if (!hasAny) return { kind: "none" };
  if (md.ckV == null) return { kind: "invalid", reason: "Teil-Snapshot ohne Version" };
  if (md.ckV !== CUSTOM_KM_VERSION) return { kind: "invalid", reason: `unbekannte/alte Version ${md.ckV}` };
  const base = intOf(md.ckBaseKm), desired = intOf(md.ckDesired), contract = intOf(md.ckContract);
  const surcharge = intOf(md.ckSurcharge), rate = intOf(md.ckRate), rentFull = intOf(md.ckRentFull);
  const disc = intOf(md.ckDisc), dep = intOf(md.ckDep), n = intOf(md.ckAddN), tot = intOf(md.ckTot);
  if (![base, desired, contract, surcharge, rate, rentFull, disc, dep, n, tot].every(Number.isSafeInteger)) {
    return { kind: "invalid", reason: "Zahlenwerte fehlen/ungültig" };
  }
  if (md.ckPlan !== planId) return { kind: "invalid", reason: "Tarif passt nicht zum Snapshot" };
  if (!md.ckLbl || !md.ckVia) return { kind: "invalid", reason: "Tarifangaben fehlen" };
  if (surcharge <= 0 || contract < base || contract < desired || rate <= 0 || disc > rentFull || n > MAX_SNAPSHOT_ADDONS) {
    return { kind: "invalid", reason: "Werte widersprüchlich" };
  }
  const phys: SnapshotAddon[] = [];
  for (let i = 0; i < n; i++) {
    const m = /^(\d{1,9})\|([^|]+)\|(.+)$/.exec(md[`ckA${i}`] ?? "");
    if (!m || m[2] === CUSTOM_KM_ADDON_ID) return { kind: "invalid", reason: `Zubehörzeile ${i} ungültig` };
    phys.push({ id: m[2]!, label: m[3]!, price_cents: Number(m[1]) });
  }
  if (md[`ckA${n}`] != null) return { kind: "invalid", reason: "Zubehöranzahl passt nicht" };
  const sum = rentFull - disc + surcharge + phys.reduce((t, a) => t + a.price_cents, 0) + dep;
  if (sum !== tot) return { kind: "invalid", reason: `Summe ${sum} ≠ Snapshot ${tot}` };
  if (paid) {
    if ((paid.currency ?? "").toLowerCase() !== "eur") return { kind: "invalid", reason: `Währung ${paid.currency}` };
    if (paid.amountTotal !== tot) return { kind: "invalid", reason: `Stripe-Betrag ${paid.amountTotal} ≠ Snapshot ${tot}` };
  }
  const via = md.ckVia !== planId ? md.ckViaLbl : null;
  const addon: SnapshotAddon = {
    id: CUSTOM_KM_ADDON_ID,
    label: `Kilometerpaket: ${contract.toLocaleString("de-DE")} km gesamt${via ? ` (berechnet über ${via})` : ""}`,
    price_cents: surcharge,
  };
  return {
    kind: "ok",
    planLabel: md.ckLbl,
    planPriceCents: rentFull - disc,
    discountCents: disc,
    contractKm: contract,
    rateCents: rate,
    surchargeCents: surcharge,
    depositCents: dep,
    totalCents: tot,
    addons: [...phys, addon],
    addon,
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
