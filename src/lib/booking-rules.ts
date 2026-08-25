/**
 * Zentrale Buchungs-/Mietregeln und Tarif-Katalog.
 *
 * WICHTIG: Dies ist die einzige Preisquelle. Sie wird sowohl im Client (Anzeige)
 * als auch serverseitig (Stripe-Checkout, Webhook, Buchungsanlage) verwendet.
 * Der Zahlbetrag wird ausschließlich serverseitig aus diesem Katalog berechnet.
 */

export const EARLIEST_START_HOUR = 8;
export const LATEST_START_HOUR = 20;
export const LATEST_RETURN_HOUR = 22;
export const DEPOSIT_EUR = 200;

/** Reiner Kilometer-Tarif (unverändert). */
export const KM_TARIFF_CENTS_PER_KM = 90;

export type PlanId = string;

/** Fahrzeugklassen: kurzer L1H1 und langer L4H2 (jeweils +10 €). */
export type VehicleClass = "l1h1" | "l4h2";

export const VEHICLE_CLASSES: VehicleClass[] = ["l1h1", "l4h2"];

export const VEHICLE_CLASS_LABEL: Record<VehicleClass, string> = {
  l1h1: "L1H1 (kurz)",
  l4h2: "L4H2 (lang)",
};

export const VEHICLE_CLASS_SHORT_LABEL: Record<VehicleClass, string> = {
  l1h1: "L1H1",
  l4h2: "L4H2",
};

/** Aufpreis der langen Klasse gegenüber L1H1 – exakt 10 € pro Buchung. */
export const L4H2_SURCHARGE_EUR = 10;

/** Mindestbetrag beim reinen Kilometer-Tarif. */
export const KM_TARIFF_MIN_EUR: Record<VehicleClass, number> = {
  l1h1: 100,
  l4h2: 110,
};

export function isVehicleClass(value: unknown): value is VehicleClass {
  return value === "l1h1" || value === "l4h2";
}

/** Leitet die Fahrzeugklasse aus Name / Modell / Kennzeichen-Bezeichnung ab. */
export function vehicleClassFromName(...parts: Array<string | null | undefined>): VehicleClass {
  const haystack = parts.filter(Boolean).join(" ").toLowerCase().replace(/[\s-]/g, "");
  if (haystack.includes("l4h2")) return "l4h2";
  return "l1h1";
}

export function classSurchargeEur(vehicleClass: VehicleClass): number {
  return vehicleClass === "l4h2" ? L4H2_SURCHARGE_EUR : 0;
}

export type PlanEntry = {
  id: PlanId;
  label: string;
  shortLabel: string;
  days: number;            // Anzahl Tage (1 = Eintages)
  durationHours: number;   // Mietdauer in Stunden (3, 6, 24, n*24)
  price: number;           // € für die konkrete Fahrzeugklasse
  basePrice: number;       // € für L1H1 (Basis)
  vehicleClass: VehicleClass;
  classLabel: string;
  freeKm: number;
  extraKmCents: number;    // ct pro Mehrkilometer
  returnRule: string;
  idealFor?: string;
  highlight?: "popular" | "best_km" | "best_daily";
  highlightLabel?: string;
};

type PlanTemplate = Omit<PlanEntry, "price" | "basePrice" | "vehicleClass" | "classLabel"> & {
  basePrice: number;
};

/** Alle aktiven Tarife – Preise sind Basispreise für L1H1. */
const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: "3h", label: "3 Stunden Express", shortLabel: "3 h Express",
    days: 1, durationHours: 3, basePrice: 49, freeKm: 100, extraKmCents: 39,
    returnRule: "Rückgabe nach 3 Stunden",
    idealFor: "Kurze Transporte, Möbelhaus, Kleinanzeigen-Abholung",
  },
  {
    id: "6h", label: "6 Stunden Umzug Mini", shortLabel: "6 h Mini",
    days: 1, durationHours: 6, basePrice: 69, freeKm: 200, extraKmCents: 39,
    returnRule: "Rückgabe nach 6 Stunden",
    idealFor: "Kleine Umzüge, mehrere Fahrten, Entrümpelung",
  },
  {
    id: "24h_300", label: "24 Stunden Umzugstag", shortLabel: "24 h · 300 km",
    days: 1, durationHours: 24, basePrice: 99, freeKm: 300, extraKmCents: 39,
    returnRule: "Rückgabe am Folgetag zur gleichen Uhrzeit",
    idealFor: "Kompletter Umzugstag, stressfreies Be- und Entladen",
    highlight: "popular", highlightLabel: "Beliebtester Tarif",
  },
  {
    id: "24h_500", label: "24 Stunden Langstrecke", shortLabel: "24 h · 500 km",
    days: 1, durationHours: 24, basePrice: 179, freeKm: 500, extraKmCents: 39,
    returnRule: "Rückgabe am Folgetag zur gleichen Uhrzeit",
    idealFor: "Weitere Strecken, größere Abholungen, Transporte außerhalb der Region",
  },
  {
    id: "24h_800", label: "24 Stunden Fernstrecke", shortLabel: "24 h · 800 km",
    days: 1, durationHours: 24, basePrice: 289, freeKm: 800, extraKmCents: 39,
    returnRule: "Rückgabe am Folgetag zur gleichen Uhrzeit",
    idealFor: "Lange Einzelfahrten, Fernumzug, Abholung in einer anderen Region",
    highlight: "best_km", highlightLabel: "Bester Kilometer-Deal",
  },
  {
    id: "multi_2d", label: "2 Tage Kurzprojekt", shortLabel: "2 Tage",
    days: 2, durationHours: 48, basePrice: 249, freeKm: 600, extraKmCents: 35,
    returnRule: "Rückgabe nach 2 Tagen zur gleichen Uhrzeit",
    idealFor: "Wochenende, kleiner Umzug, Möbeltransport",
  },
  {
    id: "multi_3d", label: "3 Tage Umzug Plus", shortLabel: "3 Tage",
    days: 3, durationHours: 72, basePrice: 349, freeKm: 900, extraKmCents: 35,
    returnRule: "Rückgabe nach 3 Tagen zur gleichen Uhrzeit",
    idealFor: "Entspannter Umzug, Abbau, Transport und Aufbau ohne Zeitdruck",
    highlight: "popular", highlightLabel: "Beliebt für Umzüge",
  },
  {
    id: "multi_4d", label: "4 Tage Renovierungs-Tarif", shortLabel: "4 Tage",
    days: 4, durationHours: 96, basePrice: 429, freeKm: 1100, extraKmCents: 35,
    returnRule: "Rückgabe nach 4 Tagen zur gleichen Uhrzeit",
    idealFor: "Renovierung, Baumarkt, Möbelhaus, Entsorgung",
  },
  {
    id: "multi_5d", label: "5 Tage Projektwoche Mini", shortLabel: "5 Tage",
    days: 5, durationHours: 120, basePrice: 499, freeKm: 1300, extraKmCents: 35,
    returnRule: "Rückgabe nach 5 Tagen zur gleichen Uhrzeit",
    idealFor: "Längere Projekte, mehrere Transporte, Firmen oder Umbauten",
  },
  {
    id: "multi_6d", label: "6 Tage Projektwoche", shortLabel: "6 Tage",
    days: 6, durationHours: 144, basePrice: 549, freeKm: 1400, extraKmCents: 35,
    returnRule: "Rückgabe nach 6 Tagen zur gleichen Uhrzeit",
    idealFor: "Intensive Umzugswoche, Renovierung, gewerbliche Nutzung",
  },
  {
    id: "multi_7d", label: "7 Tage Wochenmiete", shortLabel: "7 Tage Wochenmiete",
    days: 7, durationHours: 168, basePrice: 599, freeKm: 1500, extraKmCents: 29,
    returnRule: "Rückgabe nach 7 Tagen zur gleichen Uhrzeit",
    idealFor: "Komplette Projektwoche, Baustelle, Umzug, Firmen",
    highlight: "best_daily", highlightLabel: "Bester Tagespreis",
  },
];

/** Alte Tarif-IDs aus Altbuchungen → aktueller Katalogeintrag (nur für Labels/Freikilometer). */
const LEGACY_PLAN_ALIASES: Record<string, string> = {
  "24h": "24h_300",
  "24h_short": "24h_300",
  "24h_long": "24h_500",
};

function withClass(tpl: PlanTemplate, vehicleClass: VehicleClass): PlanEntry {
  return {
    ...tpl,
    vehicleClass,
    classLabel: VEHICLE_CLASS_LABEL[vehicleClass],
    basePrice: tpl.basePrice,
    price: tpl.basePrice + classSurchargeEur(vehicleClass),
  };
}

/** Tarif-Katalog für eine Fahrzeugklasse. */
export function planCatalog(vehicleClass: VehicleClass = "l1h1"): PlanEntry[] {
  return PLAN_TEMPLATES.map((tpl) => withClass(tpl, vehicleClass));
}

/** Basis-Katalog (L1H1) – für einfache Übersichten. */
export const PLAN_CATALOG: PlanEntry[] = planCatalog("l1h1");

export function getPlanById(planId: string, vehicleClass: VehicleClass = "l1h1"): PlanEntry | null {
  const resolvedId = LEGACY_PLAN_ALIASES[planId] ?? planId;
  const direct = PLAN_TEMPLATES.find((p) => p.id === resolvedId);
  if (direct) return withClass(direct, vehicleClass);

  const m = /^week_x(\d+)$/.exec(resolvedId);
  if (m) {
    const n = Math.max(1, parseInt(m[1], 10));
    const base = PLAN_TEMPLATES.find((p) => p.id === "multi_7d");
    if (!base) return null;
    const days = n * 7;
    const basePrice = base.basePrice * n;
    return {
      ...base,
      id: resolvedId,
      label: `${n} × 7 Tage Wochenmiete (${days} Tage)`,
      shortLabel: `${n}× Wochenmiete`,
      days,
      durationHours: days * 24,
      basePrice,
      price: basePrice + classSurchargeEur(vehicleClass),
      vehicleClass,
      classLabel: VEHICLE_CLASS_LABEL[vehicleClass],
      freeKm: base.freeKm * n,
      returnRule: `Rückgabe nach ${days} Tagen zur gleichen Uhrzeit`,
      idealFor: n > 1 ? `Längere Miete: ${n} volle Wochen` : base.idealFor,
      highlight: undefined,
      highlightLabel: undefined,
    };
  }
  return null;
}

/** Vollständiges Label inkl. Fahrzeugklasse – so wird es in Buchung/Rechnung gespeichert. */
export function planLabelWithClass(plan: PlanEntry): string {
  return `${plan.label} · ${VEHICLE_CLASS_SHORT_LABEL[plan.vehicleClass]}`;
}

/**
 * Liefert die für eine Nächtezahl + Startstunde verfügbaren Tarife.
 * 0 Nächte (selber Tag) → nur Tagesmiete unter 24h (3h/6h).
 * 1 Nacht → 24h-Tarife (Rückgabe Folgetag gleiche Uhrzeit).
 * 2-7 Nächte → passender Mehrtagestarif (days === nights).
 * 8+ Nächte → dynamisches Wochenpaket mit ceil(nights/7) × Wochenmiete.
 */
export function getAvailablePlans(
  nights: number,
  startHour: number | null,
  vehicleClass: VehicleClass = "l1h1",
): PlanEntry[] {
  if (nights < 0) return [];
  const catalog = planCatalog(vehicleClass);
  let candidates: PlanEntry[];
  if (nights === 0) {
    candidates = catalog.filter((p) => p.days === 1 && p.durationHours < 24);
  } else if (nights === 1) {
    candidates = catalog.filter((p) => p.days === 1 && p.durationHours === 24);
  } else if (nights >= 2 && nights <= 7) {
    candidates = catalog.filter((p) => p.days === nights);
  } else {
    const n = Math.ceil(nights / 7);
    const synth = getPlanById(`week_x${n}`, vehicleClass);
    candidates = synth ? [synth] : [];
  }
  if (startHour === null) return candidates;
  return candidates.filter((p) => isStartHourAllowed(p.id, startHour));
}

/** Liefert das exakte Rückgabe-Datum/-Uhrzeit für einen Tarif. */
export function computePlanReturn(planId: PlanId, startDate: Date, startHour: number): Date {
  const start = new Date(startDate);
  start.setHours(startHour, 0, 0, 0);
  // Reiner Kilometer-Tarif → bis spätestens 22:00 desselben Tages
  if (planId === "km") {
    const end = new Date(start);
    end.setHours(LATEST_RETURN_HOUR, 0, 0, 0);
    return end;
  }
  const plan = getPlanById(planId);
  if (plan) return new Date(start.getTime() + plan.durationHours * 3600_000);
  // Fallback: 6h legacy
  if (planId === "6h") return new Date(start.getTime() + 6 * 3600_000);
  return new Date(start.getTime() + 24 * 3600_000);
}

/** Dauer (ms), die eine Buchung das Fahrzeug blockiert. */
export function planBlockDurationMs(planId: PlanId, startDate: Date, startHour: number): number {
  const start = new Date(startDate);
  start.setHours(startHour, 0, 0, 0);
  const end = computePlanReturn(planId, startDate, startHour);
  return Math.max(0, end.getTime() - start.getTime());
}

/** Gibt es überhaupt eine gültige Startzeit für diesen Tarif? */
export function isStartHourAllowed(planId: PlanId, startHour: number): boolean {
  if (startHour < EARLIEST_START_HOUR || startHour > LATEST_START_HOUR) return false;
  const plan = getPlanById(planId);
  if (plan && plan.days === 1 && plan.durationHours < 24) {
    return startHour + plan.durationHours <= LATEST_RETURN_HOUR;
  }
  if (planId === "6h") return startHour + 6 <= LATEST_RETURN_HOUR;
  return true;
}
