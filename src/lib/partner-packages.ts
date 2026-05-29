export type PartnerPackageId = "large" | "tailgate" | "medium" | "small";

export interface PartnerPackage {
  id: PartnerPackageId;
  name: string;
  sizeLabel: string;
  widthCm: number;
  heightCm: number;
  description: string;
  /** Preis in € für 1 / 2 / 3 Jahre (Werbefläche, ohne Bearbeitungsgebühr) */
  prices: { years: 1 | 2 | 3; total: number; perYear: number }[];
  /** Einmalige Bearbeitungs-/Produktionsgebühr Magnetfolie in € */
  setupFee: number;
}

export const PARTNER_PACKAGES: PartnerPackage[] = [
  {
    id: "large",
    name: "Große Seitenfläche",
    sizeLabel: "ca. 200 × 100 cm",
    widthCm: 200,
    heightCm: 100,
    description:
      "Maximale Sichtbarkeit auf der gesamten Seitenwand – die Premium-Werbefläche unseres Transporters.",
    prices: [
      { years: 1, total: 1200, perYear: 1200 },
      { years: 2, total: 2000, perYear: 1000 },
      { years: 3, total: 2700, perYear: 900 },
    ],
    setupFee: 149,
  },
  {
    id: "tailgate",
    name: "Heckklappe",
    sizeLabel: "ca. 120 × 80 cm",
    widthCm: 120,
    heightCm: 80,
    description:
      "Wirkt im Stau, an der Ampel und auf der Autobahn – die Heckfläche wird besonders lange gelesen.",
    prices: [
      { years: 1, total: 800, perYear: 800 },
      { years: 2, total: 1400, perYear: 700 },
      { years: 3, total: 1950, perYear: 650 },
    ],
    setupFee: 149,
  },
  {
    id: "medium",
    name: "Mittlere Seitenfläche",
    sizeLabel: "ca. 100 × 60 cm",
    widthCm: 100,
    heightCm: 60,
    description:
      "Gutes Preis-/Leistungsverhältnis – ideal für Logo, Slogan und Kontaktdaten.",
    prices: [
      { years: 1, total: 600, perYear: 600 },
      { years: 2, total: 1000, perYear: 500 },
      { years: 3, total: 1350, perYear: 450 },
    ],
    setupFee: 149,
  },
  {
    id: "small",
    name: "Kleine Fläche",
    sizeLabel: "ca. 50 × 30 cm",
    widthCm: 50,
    heightCm: 30,
    description:
      "Günstiger Einstieg für lokale Werbung – z. B. Logo oder QR-Code.",
    prices: [
      { years: 1, total: 300, perYear: 300 },
      { years: 2, total: 520, perYear: 260 },
      { years: 3, total: 720, perYear: 240 },
    ],
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