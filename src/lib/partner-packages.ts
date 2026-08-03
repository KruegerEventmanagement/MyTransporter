import {
  ALL_ZONES,
  VIEWS,
  polygonAreaPx,
  polygonBBox,
  type ViewId,
  type Zone,
} from "./partner-zones";

export type PartnerPackageId = string;

export interface PartnerPackage {
  id: PartnerPackageId;
  code: string;
  view: ViewId;
  viewLabel: string;
  sqm: number;
  widthCm: number;
  heightCm: number;
  sizeLabel: string;
  monthly: number;
  listMonthly: number;
  prices: { years: 1 | 2 | 3; monthly: number; total: number }[];
  setupFee: number;
  zone: Zone;
}

const ROUND_TO = 5;
const MIN_MONTHLY = 19;
const SETUP_FEE = 0;

/** Aktion: -30 % auf alle Flächenpreise, Folienproduktion geschenkt. */
export const PROMO_FACTOR = 0.7;
export const PROMO_DISCOUNT_PERCENT = 30;
export const REGULAR_SETUP_FEE = 149;

function round5(n: number): number {
  return Math.max(MIN_MONTHLY, Math.round(n / ROUND_TO) * ROUND_TO);
}

function buildPrices(monthly: number) {
  const m1 = monthly;
  const m2 = round5(monthly * 0.9);
  const m3 = round5(monthly * 0.8);
  return [
    { years: 1 as const, monthly: m1, total: m1 * 12 },
    { years: 2 as const, monthly: m2, total: m2 * 24 },
    { years: 3 as const, monthly: m3, total: m3 * 36 },
  ];
}

function buildPackage(zone: Zone): PartnerPackage {
  const view = VIEWS[zone.view];
  const px = polygonAreaPx(zone.points);
  const sqm = px / (view.pxPerMeter * view.pxPerMeter);
  const bbox = polygonBBox(zone.points);
  const widthCm = Math.round((bbox.width / view.pxPerMeter) * 100);
  const heightCm = Math.round((bbox.height / view.pxPerMeter) * 100);
  const listMonthly = Math.max(29, Math.round((sqm * view.ratePerSqmMonth) / ROUND_TO) * ROUND_TO);
  const monthly = round5(listMonthly * PROMO_FACTOR);
  return {
    id: zone.code,
    code: zone.code,
    view: zone.view,
    viewLabel: view.label,
    sqm: Math.round(sqm * 100) / 100,
    widthCm,
    heightCm,
    sizeLabel: `ca. ${widthCm} \u00d7 ${heightCm} cm`,
    monthly,
    listMonthly,
    prices: buildPrices(monthly),
    setupFee: SETUP_FEE,
    zone,
  };
}

export const PARTNER_PACKAGES: PartnerPackage[] = ALL_ZONES.map(buildPackage);

const PACKAGE_BY_ID: Record<string, PartnerPackage> = Object.fromEntries(
  PARTNER_PACKAGES.map((p) => [p.id, p]),
);

export function getPartnerPackage(id: PartnerPackageId): PartnerPackage {
  const p = PACKAGE_BY_ID[id];
  if (!p) throw new Error(`Unbekanntes Paket: ${id}`);
  return p;
}

export function getPartnerPackageOrNull(id: string): PartnerPackage | null {
  return PACKAGE_BY_ID[id] ?? null;
}

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatSqm(sqm: number): string {
  return `ca. ${sqm.toFixed(2).replace(".", ",")} m\u00b2`;
}

export const PACKAGES_BY_VIEW: Record<ViewId, PartnerPackage[]> = {
  driver: PARTNER_PACKAGES.filter((p) => p.view === "driver"),
  passenger: PARTNER_PACKAGES.filter((p) => p.view === "passenger"),
  rear: PARTNER_PACKAGES.filter((p) => p.view === "rear"),
  front: PARTNER_PACKAGES.filter((p) => p.view === "front"),
};
