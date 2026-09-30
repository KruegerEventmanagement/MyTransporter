/**
 * Zentrale Buchungs-/Mietregeln und Tarif-Katalog.
 *
 * WICHTIG: Dies ist die einzige Preisquelle. Sie wird sowohl im Client (Anzeige)
 * als auch serverseitig (Stripe-Checkout, Webhook, Buchungsanlage) verwendet.
 * Der Zahlbetrag wird ausschließlich serverseitig aus diesem Katalog berechnet.
 *
 * Preis-Invariante: Grundtarif + Mehrkilometer ist nie günstiger als ein
 * beworbenes Kilometerpaket. Beispiel L1H1: 24h/200 km (99 €) + 300 km × 0,45 €
 * = 234 € > 189 € (24h/500-km-Paket); 24h/800 km kostet als Paket 299 € statt 369 €.
 *
 * Kilometer-Katalogversion: Seit KM_CATALOG_VERSION sind die zeitabhängigen
 * Inklusivkilometer um ein Drittel reduziert (Faktor 2/3). Bestehende Buchungen
 * behalten ihre gespeicherten free_km/km_price_cents; Checkouts ohne Version
 * werden mit LEGACY_FREE_KM aufgelöst (siehe freeKmForCatalogVersion).
 */

export const EARLIEST_START_HOUR = 8;
export const LATEST_START_HOUR = 20;
export const LATEST_RETURN_HOUR = 22;
export const DEPOSIT_EUR = 200;

/** Reiner Kilometer-Tarif (unverändert). */
export const KM_TARIFF_CENTS_PER_KM = 90;

export type PlanId = string;

/** Fahrzeugklassen: kurzer L1H1, langer L4H2 und der extra lange Crafter (L5H2). */
export type VehicleClass = "l1h1" | "l4h2" | "l5h2";

export const VEHICLE_CLASSES: VehicleClass[] = ["l1h1", "l4h2", "l5h2"];

export const VEHICLE_CLASS_LABEL: Record<VehicleClass, string> = {
  l1h1: "L1H1 (kurz)",
  l4h2: "L4H2 (lang)",
  l5h2: "L5H2 (extra lang)",
};

export const VEHICLE_CLASS_SHORT_LABEL: Record<VehicleClass, string> = {
  l1h1: "L1H1",
  l4h2: "L4H2",
  l5h2: "L5H2",
};

/**
 * Aufpreis der langen Klasse gegenüber L1H1: 10 € je Miettag.
 * Eintagestarife (3h/6h/24h): +10 € · 2 Tage: +20 € · … · 7 Tage: +70 €.
 * Die verbindlichen L4H2-Preise stehen explizit im Tarif-Katalog (basePriceL4h2).
 */
export const L4H2_SURCHARGE_PER_DAY_EUR = 10;

/** Aufpreis des extra langen Crafters (L5H2) gegenüber L4H2, aufgerundet auf 5 €. */
export const L5H2_SURCHARGE_EUR = 15;

/** L5H2-Preis aus dem L4H2-Preis: +15 €, auf volle 5 € aufgerundet (z. B. 59 → 75). */
export function l5h2PriceFrom(priceL4h2: number): number {
  return Math.ceil((priceL4h2 + L5H2_SURCHARGE_EUR) / 5) * 5;
}

/** Mindestbetrag beim reinen Kilometer-Tarif. */
export const KM_TARIFF_MIN_EUR: Record<VehicleClass, number> = {
  l1h1: 100,
  l4h2: 110,
  l5h2: 125,
};

export function isVehicleClass(value: unknown): value is VehicleClass {
  return value === "l1h1" || value === "l4h2" || value === "l5h2";
}

/** Leitet die Fahrzeugklasse aus Name / Modell / Kennzeichen-Bezeichnung ab. */
export function vehicleClassFromName(...parts: Array<string | null | undefined>): VehicleClass {
  const haystack = parts.filter(Boolean).join(" ").toLowerCase().replace(/[\s-]/g, "");
  if (haystack.includes("l5h2") || haystack.includes("crafter")) return "l5h2";
  if (haystack.includes("l4h2")) return "l4h2";
  return "l1h1";
}



export type PlanEntry = {
  id: PlanId;
  label: string;
  shortLabel: string;
  days: number;            // Anzahl Tage (1 = Eintages)
  durationHours: number;   // Mietdauer in Stunden (3, 6, 24, n*24)
  price: number;           // € für die konkrete Fahrzeugklasse
  basePrice: number;       // € für L1H1 (Basis)
  priceL4h2: number;       // € für L4H2 (verbindlicher Katalogpreis)
  priceL5h2: number;       // € für den extra langen Crafter (L5H2)
  vehicleClass: VehicleClass;
  classLabel: string;
  freeKm: number;
  extraKmCents: number;    // ct pro Mehrkilometer
  returnRule: string;
  idealFor?: string;
  highlight?: "popular" | "best_km" | "best_daily";
  highlightLabel?: string;
};

type PlanTemplate = Omit<
  PlanEntry,
  "price" | "basePrice" | "priceL4h2" | "priceL5h2" | "vehicleClass" | "classLabel" | "extraKmCents"
> & {
  basePrice: number;
  basePriceL4h2: number;
};

/** Mehrkilometer-Bänder: Eintagestarife, 2–6 Tage, Wochenmiete (ab 7 Tagen). */
export type ExtraKmBand = "day" | "multi" | "week";

/**
 * Mehrkilometersätze (ct/km) je Fahrzeugklasse und Band – einzige Quelle.
 * Seit 30.09.2026 (Eigentümerauftrag) einheitlich 0,45 € für alle Klassen und Bänder.
 * Frühere Sätze (0,45 / 0,35 / 0,29) stehen in LEGACY_EXTRA_KM_CENTS für Altsessions.
 */
export const EXTRA_KM_CENTS_BY_CLASS: Record<VehicleClass, Record<ExtraKmBand, number>> = {
  l1h1: { day: 45, multi: 45, week: 45 },
  l4h2: { day: 45, multi: 45, week: 45 },
  l5h2: { day: 45, multi: 45, week: 45 },
};

/** Mehrkilometersätze vor der Vereinheitlichung auf 0,45 € – nur für alte Checkouts. */
export const LEGACY_EXTRA_KM_CENTS: Record<ExtraKmBand, number> = { day: 45, multi: 35, week: 29 };

export function extraKmBandForDays(days: number): ExtraKmBand {
  if (days >= 7) return "week";
  if (days >= 2) return "multi";
  return "day";
}

/** Mehrkilometersatz in Cent für Klasse + Tarif-Tage. */
export function extraKmCentsFor(vehicleClass: VehicleClass, days: number): number {
  return EXTRA_KM_CENTS_BY_CLASS[vehicleClass][extraKmBandForDays(days)];
}


/** Alle aktiven Tarife – verbindliche Preise für L1H1 und L4H2. */
const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: "3h", label: "3 Stunden Express", shortLabel: "3 h Express",
    days: 1, durationHours: 3, basePrice: 49, basePriceL4h2: 59, freeKm: 67,
    returnRule: "Rückgabe nach 3 Stunden",
    idealFor: "Kurze Transporte, Möbelhaus, Kleinanzeigen-Abholung",
  },
  {
    id: "6h", label: "6 Stunden Umzug Mini", shortLabel: "6 h Mini",
    days: 1, durationHours: 6, basePrice: 69, basePriceL4h2: 79, freeKm: 133,
    returnRule: "Rückgabe nach 6 Stunden",
    idealFor: "Kleine Umzüge, mehrere Fahrten, Entrümpelung",
  },
  {
    id: "24h_300", label: "24 Stunden Umzugstag", shortLabel: "24 h · 200 km",
    days: 1, durationHours: 24, basePrice: 99, basePriceL4h2: 109, freeKm: 200,
    returnRule: "Rückgabe am Folgetag zur gleichen Uhrzeit",
    idealFor: "Kompletter Umzugstag, stressfreies Be- und Entladen",
    highlight: "popular", highlightLabel: "Beliebtester Tarif",
  },
  {
    id: "24h_500", label: "24 Stunden Langstrecke", shortLabel: "24 h · 500 km",
    days: 1, durationHours: 24, basePrice: 189, basePriceL4h2: 199, freeKm: 500,
    returnRule: "Rückgabe am Folgetag zur gleichen Uhrzeit",
    idealFor: "Weitere Strecken, größere Abholungen, Transporte außerhalb der Region",
  },
  {
    id: "24h_800", label: "24 Stunden Fernstrecke", shortLabel: "24 h · 800 km",
    days: 1, durationHours: 24, basePrice: 299, basePriceL4h2: 309, freeKm: 800,
    returnRule: "Rückgabe am Folgetag zur gleichen Uhrzeit",
    idealFor: "Lange Einzelfahrten, Fernumzug, Abholung in einer anderen Region",
    highlight: "best_km", highlightLabel: "Bester Kilometer-Deal",
  },
  {
    id: "multi_2d", label: "2 Tage Kurzprojekt", shortLabel: "2 Tage",
    days: 2, durationHours: 48, basePrice: 189, basePriceL4h2: 209, freeKm: 400,
    returnRule: "Rückgabe nach 2 Tagen zur gleichen Uhrzeit",
    idealFor: "Wochenende, kleiner Umzug, Möbeltransport",
  },
  {
    id: "multi_3d", label: "3 Tage Umzug Plus", shortLabel: "3 Tage",
    days: 3, durationHours: 72, basePrice: 269, basePriceL4h2: 299, freeKm: 600,
    returnRule: "Rückgabe nach 3 Tagen zur gleichen Uhrzeit",
    idealFor: "Entspannter Umzug, Abbau, Transport und Aufbau ohne Zeitdruck",
    highlight: "popular", highlightLabel: "Beliebt für Umzüge",
  },
  {
    id: "multi_4d", label: "4 Tage Renovierungs-Tarif", shortLabel: "4 Tage",
    days: 4, durationHours: 96, basePrice: 339, basePriceL4h2: 379, freeKm: 800,
    returnRule: "Rückgabe nach 4 Tagen zur gleichen Uhrzeit",
    idealFor: "Renovierung, Baumarkt, Möbelhaus, Entsorgung",
  },
  {
    id: "multi_5d", label: "5 Tage Projektwoche Mini", shortLabel: "5 Tage",
    days: 5, durationHours: 120, basePrice: 399, basePriceL4h2: 449, freeKm: 1000,
    returnRule: "Rückgabe nach 5 Tagen zur gleichen Uhrzeit",
    idealFor: "Längere Projekte, mehrere Transporte, Firmen oder Umbauten",
  },
  {
    id: "multi_6d", label: "6 Tage Projektwoche", shortLabel: "6 Tage",
    days: 6, durationHours: 144, basePrice: 449, basePriceL4h2: 509, freeKm: 1200,
    returnRule: "Rückgabe nach 6 Tagen zur gleichen Uhrzeit",
    idealFor: "Intensive Umzugswoche, Renovierung, gewerbliche Nutzung",
  },
  {
    id: "multi_7d", label: "7 Tage Wochenmiete", shortLabel: "7 Tage Wochenmiete",
    days: 7, durationHours: 168, basePrice: 499, basePriceL4h2: 569, freeKm: 1400,
    returnRule: "Rückgabe nach 7 Tagen zur gleichen Uhrzeit",
    idealFor: "Komplette Projektwoche, Baustelle, Umzug, Firmen",
    highlight: "best_daily", highlightLabel: "Bester Tagespreis",
  },
];

/** Aktuelle Kilometer-Katalogversion (wird in Stripe-Metadata festgehalten). */
export const KM_CATALOG_VERSION = "km-2026-09-30b";
/** Vorherige Version (neue km, alte Sätze 0,35/0,29) – Snapshots daraus bleiben gültig. */
export const PREVIOUS_KM_CATALOG_VERSIONS = ["km-2026-09-30"] as const;

export const KM_CATALOG_OUTDATED_MESSAGE =
  "Tarife wurden aktualisiert. Bitte Seite neu laden und die aktuellen Konditionen prüfen.";

/**
 * Prüft die vom Browser angezeigte Katalogversion vor einem neuen Checkout.
 * Nur Konsistenzprüfung – kein Preis-Input; der Server rechnet selbst.
 */
export function checkoutKmCatalogError(clientVersion: unknown): string | null {
  return clientVersion === KM_CATALOG_VERSION ? null : KM_CATALOG_OUTDATED_MESSAGE;
}

/** Inklusivkilometer VOR dem 30.09.2026 – nur für Checkouts/Buchungen ohne Versions-Snapshot. */
export const LEGACY_FREE_KM: Record<string, number> = {
  "3h": 100, "6h": 200, "24h_300": 300, "24h_500": 500, "24h_800": 800,
  multi_2d: 600, multi_3d: 900, multi_4d: 1200, multi_5d: 1500, multi_6d: 1800, multi_7d: 2100,
};

/** Alt-Kontingent eines Tarifs (auch Alias-IDs und week_xN = 2100 × N); null wenn unbekannt. */
export function legacyFreeKmFor(planId: string): number | null {
  const id = LEGACY_PLAN_ALIASES[planId] ?? planId;
  if (id in LEGACY_FREE_KM) return LEGACY_FREE_KM[id];
  const m = /^week_x(\d+)$/.exec(id);
  if (m) return LEGACY_FREE_KM.multi_7d * Math.max(1, parseInt(m[1], 10));
  return null;
}

/**
 * Inklusivkilometer passend zur Katalogversion eines Checkouts:
 * aktuelle Version → aktueller Katalog, fehlende/alte Version → Legacy-Werte.
 * Niemals ein altes Checkout mit dem gekürzten Kontingent auflösen.
 */
export function freeKmForCatalogVersion(
  planId: string,
  version: string | null | undefined,
  vehicleClass: VehicleClass = "l1h1",
): number | null {
  if (version === KM_CATALOG_VERSION || (PREVIOUS_KM_CATALOG_VERSIONS as readonly string[]).includes(version ?? "")) {
    return getPlanById(planId, vehicleClass)?.freeKm ?? null;
  }
  return legacyFreeKmFor(planId);
}

/**
 * Kilometer-Snapshot für eine neue Buchung aus Stripe-Metadata (Webhook).
 * Gültiger Snapshot (aktuelle oder vorherige Version) → genau diese Werte;
 * alte Session ohne Snapshot → Legacy-Kontingent UND Legacy-Mehrkilometersatz,
 * damit nie ein höherer Satz als beim Checkout angezeigt berechnet wird.
 */
export function resolveCheckoutKmSnapshot(
  md: Record<string, string | undefined>,
  planId: string,
  vehicleClass: VehicleClass,
): { freeKm: number; kmPriceCents: number } {
  const num = (v: string | undefined) => (v != null && v !== "" ? Number(v) : NaN);
  const f = num(md.freeKm);
  const c = num(md.kmPriceCents);
  const plan = getPlanById(planId, vehicleClass);
  const isCurrent = md.kmCatalog === KM_CATALOG_VERSION;
  const legacyCents = plan && plan.id !== "km" ? LEGACY_EXTRA_KM_CENTS[extraKmBandForDays(plan.days)] : KM_TARIFF_CENTS_PER_KM;
  const fallbackCents = isCurrent ? (plan?.extraKmCents ?? KM_TARIFF_CENTS_PER_KM) : legacyCents;
  const known = isCurrent || (PREVIOUS_KM_CATALOG_VERSIONS as readonly string[]).includes(md.kmCatalog ?? "");
  if (known && Number.isInteger(f) && f >= 0) {
    return { freeKm: f, kmPriceCents: Number.isInteger(c) && c >= 0 ? c : fallbackCents };
  }
  return { freeKm: freeKmForCatalogVersion(planId, md.kmCatalog ?? null, vehicleClass) ?? 0, kmPriceCents: fallbackCents };
}

/**
 * Freikilometer einer bestehenden Buchung: gespeicherter Snapshot gilt strikt
 * (0 ist gültig); nur wenn er fehlt → Legacy-Katalog, nie der gekürzte neue.
 */
export function bookingFreeKm(planId: string | null | undefined, storedFreeKm: number | null | undefined): number {
  if (typeof storedFreeKm === "number" && Number.isFinite(storedFreeKm)) return storedFreeKm;
  if (!planId || planId === "km") return 0;
  return legacyFreeKmFor(planId) ?? 0;
}

/** Alte Tarif-IDs aus Altbuchungen → aktueller Katalogeintrag (nur für Labels/Freikilometer). */
const LEGACY_PLAN_ALIASES: Record<string, string> = {
  "24h": "24h_300",
  "24h_short": "24h_300",
  "24h_long": "24h_500",
};

function priceForClass(
  vehicleClass: VehicleClass,
  basePrice: number,
  priceL4h2: number,
  priceL5h2: number,
): number {
  if (vehicleClass === "l5h2") return priceL5h2;
  if (vehicleClass === "l4h2") return priceL4h2;
  return basePrice;
}

function withClass(tpl: PlanTemplate, vehicleClass: VehicleClass): PlanEntry {
  const { basePriceL4h2, ...rest } = tpl;
  const priceL5h2 = l5h2PriceFrom(basePriceL4h2);
  return {
    ...rest,
    extraKmCents: extraKmCentsFor(vehicleClass, tpl.days),
    vehicleClass,
    classLabel: VEHICLE_CLASS_LABEL[vehicleClass],
    basePrice: tpl.basePrice,
    priceL4h2: basePriceL4h2,
    priceL5h2,
    price: priceForClass(vehicleClass, tpl.basePrice, basePriceL4h2, priceL5h2),
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
    const priceL4h2 = base.basePriceL4h2 * n;
    const priceL5h2 = l5h2PriceFrom(base.basePriceL4h2) * n;
    return {
      ...withClass(base, vehicleClass),
      id: resolvedId,
      label: `${n} × 7 Tage Wochenmiete (${days} Tage)`,
      shortLabel: `${n}× Wochenmiete`,
      days,
      durationHours: days * 24,
      basePrice,
      priceL4h2,
      priceL5h2,
      price: priceForClass(vehicleClass, basePrice, priceL4h2, priceL5h2),

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
