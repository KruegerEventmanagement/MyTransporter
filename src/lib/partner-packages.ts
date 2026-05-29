// Marktrecherche (Mai 2026, Region Stuttgart/Böblingen):
// - Mobile Außenwerbung DE: ~50–400 €/Monat je Fläche
// - Hauptsponsor-Großflächen (Trikot-/Fahrzeugsponsoring Amateurbereich): 200–300 €/Monat
// - Heck mit QR/CTA (höchster Blickkontakt im Stau): 120–180 €/Monat
// - City-Spot (60×40): 50–80 €/Monat
// - Mini-Logo-Flächen (Sponsorenwand-Stil): 20–40 €/Monat
// → Unsere Preise liegen mittig und sind regional realistisch.

export type PartnerPackageId =
  | "hauptsponsor"
  | "leschi"
  | "heck_goldplatz"
  | "city_spot"
  | "mini_spot";

export interface PartnerPackage {
  id: PartnerPackageId;
  code: string;
  name: string;
  sizeLabel: string;
  widthCm: number;
  heightCm: number;
  /** Anzahl verfügbarer Plätze auf dem Transporter */
  slots: number;
  description: string;
  /** Monatspreis (Vollpreis bei 1 Jahr) */
  monthly: number;
  /** Preis in € für 1 / 2 / 3 Jahre (Werbefläche, ohne Bearbeitungsgebühr) */
  prices: { years: 1 | 2 | 3; monthly: number; total: number }[];
  /** Einmalige Bearbeitungs-/Produktionsgebühr Magnetfolie in € */
  setupFee: number;
}

function buildPrices(monthly: number) {
  const m1 = monthly;
  const m2 = Math.round(monthly * 0.9);
  const m3 = Math.round(monthly * 0.8);
  return [
    { years: 1 as const, monthly: m1, total: m1 * 12 },
    { years: 2 as const, monthly: m2, total: m2 * 24 },
    { years: 3 as const, monthly: m3, total: m3 * 36 },
  ];
}

export const PARTNER_PACKAGES: PartnerPackage[] = [
  {
    id: "hauptsponsor",
    code: "HS",
    name: "Hauptsponsor",
    sizeLabel: "140 × 80 cm",
    widthCm: 140,
    heightCm: 80,
    slots: 2,
    description:
      "Größte und auffälligste Seitenfläche – maximale Sichtbarkeit, exklusive Position. Nur 2× verfügbar.",
    monthly: 249,
    prices: buildPrices(249),
    setupFee: 149,
  },
  {
    id: "leschi",
    code: "L",
    name: "Leschi",
    sizeLabel: "100 × 60 cm",
    widthCm: 100,
    heightCm: 60,
    slots: 2,
    description:
      "Premium-Seitenfläche mit hoher Sichtbarkeit, direkt neben dem Hauptsponsor.",
    monthly: 129,
    prices: buildPrices(129),
    setupFee: 149,
  },
  {
    id: "heck_goldplatz",
    code: "HG",
    name: "Heck Goldplatz",
    sizeLabel: "90 × 50 cm",
    widthCm: 90,
    heightCm: 50,
    slots: 2,
    description:
      "Premium-Heckfläche – ideal für QR-Code oder Call-to-Action. Wirkt lang im Stau und an der Ampel.",
    monthly: 149,
    prices: buildPrices(149),
    setupFee: 149,
  },
  {
    id: "city_spot",
    code: "C",
    name: "City Spot",
    sizeLabel: "60 × 40 cm",
    widthCm: 60,
    heightCm: 40,
    slots: 10,
    description:
      "Standard-Werbefläche für regionale Firmen – günstig, gut sichtbar, in mehreren Positionen verfügbar.",
    monthly: 69,
    prices: buildPrices(69),
    setupFee: 149,
  },
  {
    id: "mini_spot",
    code: "M",
    name: "Mini Spot",
    sizeLabel: "30 × 25 cm",
    widthCm: 30,
    heightCm: 25,
    slots: 10,
    description:
      "Kompakte Zusatzfläche im Sponsorenwand-Stil – perfekt für Logo, Kontakt oder QR-Code.",
    monthly: 29,
    prices: buildPrices(29),
    setupFee: 149,
  },
];

export function getPartnerPackage(id: PartnerPackageId): PartnerPackage {
  const pkg = PARTNER_PACKAGES.find((p) => p.id === id);
  if (!pkg) throw new Error(`Unbekanntes Paket: ${id}`);
  return pkg;
}

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}