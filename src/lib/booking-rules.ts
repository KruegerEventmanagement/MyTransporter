/**
 * Zentrale Buchungs-/Mietregeln und Tarif-Katalog.
 */

export const EARLIEST_START_HOUR = 8;
export const LATEST_START_HOUR = 20;
export const LATEST_RETURN_HOUR = 22;
export const DEPOSIT_EUR = 200;

export type PlanId = string;

export type PlanEntry = {
  id: PlanId;
  label: string;
  shortLabel: string;
  days: number;            // Anzahl Tage (1 = Eintages)
  durationHours: number;   // Mietdauer in Stunden (3, 6, 24, n*24)
  price: number;           // €
  freeKm: number;
  extraKmCents: number;    // ct pro Mehrkilometer
  returnRule: string;
  idealFor?: string;
  highlight?: "popular" | "best_km" | "best_daily";
  highlightLabel?: string;
};

/** Alle aktiven Tarife. */
export const PLAN_CATALOG: PlanEntry[] = [
  {
    id: "3h", label: "3 Stunden Express", shortLabel: "3 h Express",
    days: 1, durationHours: 3, price: 39, freeKm: 100, extraKmCents: 39,
    returnRule: "Rückgabe nach 3 Stunden",
    idealFor: "Kurze Transporte, Möbelhaus, Kleinanzeigen-Abholung",
  },
  {
    id: "6h", label: "6 Stunden Umzug Mini", shortLabel: "6 h Mini",
    days: 1, durationHours: 6, price: 59, freeKm: 200, extraKmCents: 39,
    returnRule: "Rückgabe nach 6 Stunden",
    idealFor: "Kleine Umzüge, mehrere Fahrten, Entrümpelung",
  },
  {
    id: "24h_short", label: "24 Stunden Umzugstag", shortLabel: "24 h Umzugstag",
    days: 1, durationHours: 24, price: 89, freeKm: 300, extraKmCents: 39,
    returnRule: "Rückgabe am Folgetag zur gleichen Uhrzeit",
    idealFor: "Kompletter Umzugstag, stressfreies Be- und Entladen",
    highlight: "popular", highlightLabel: "Beliebtester Tarif",
  },
  {
    id: "24h_long", label: "24 Stunden Langstrecke", shortLabel: "24 h Langstrecke",
    days: 1, durationHours: 24, price: 119, freeKm: 500, extraKmCents: 39,
    returnRule: "Rückgabe am Folgetag zur gleichen Uhrzeit",
    idealFor: "Weitere Strecken, größere Abholungen, Transporte außerhalb der Region",
    highlight: "best_km", highlightLabel: "Bester Kilometer-Deal",
  },
  {
    id: "multi_2d", label: "2 Tage Kurzprojekt", shortLabel: "2 Tage",
    days: 2, durationHours: 48, price: 159, freeKm: 600, extraKmCents: 35,
    returnRule: "Rückgabe nach 2 Tagen zur gleichen Uhrzeit",
    idealFor: "Wochenende, kleiner Umzug, Möbeltransport",
  },
  {
    id: "multi_3d", label: "3 Tage Umzug Plus", shortLabel: "3 Tage",
    days: 3, durationHours: 72, price: 219, freeKm: 900, extraKmCents: 35,
    returnRule: "Rückgabe nach 3 Tagen zur gleichen Uhrzeit",
    idealFor: "Entspannter Umzug, Abbau, Transport und Aufbau ohne Zeitdruck",
    highlight: "popular", highlightLabel: "Beliebt für Umzüge",
  },
  {
    id: "multi_4d", label: "4 Tage Renovierungs-Tarif", shortLabel: "4 Tage",
    days: 4, durationHours: 96, price: 289, freeKm: 1100, extraKmCents: 35,
    returnRule: "Rückgabe nach 4 Tagen zur gleichen Uhrzeit",
    idealFor: "Renovierung, Baumarkt, Möbelhaus, Entsorgung",
  },
  {
    id: "multi_5d", label: "5 Tage Projektwoche Mini", shortLabel: "5 Tage",
    days: 5, durationHours: 120, price: 349, freeKm: 1300, extraKmCents: 35,
    returnRule: "Rückgabe nach 5 Tagen zur gleichen Uhrzeit",
    idealFor: "Längere Projekte, mehrere Transporte, Firmen oder Umbauten",
  },
  {
    id: "multi_6d", label: "6 Tage Projektwoche", shortLabel: "6 Tage",
    days: 6, durationHours: 144, price: 399, freeKm: 1400, extraKmCents: 35,
    returnRule: "Rückgabe nach 6 Tagen zur gleichen Uhrzeit",
    idealFor: "Intensive Umzugswoche, Renovierung, gewerbliche Nutzung",
  },
  {
    id: "multi_7d", label: "7 Tage Wochenmiete", shortLabel: "7 Tage Wochenmiete",
    days: 7, durationHours: 168, price: 449, freeKm: 1500, extraKmCents: 29,
    returnRule: "Rückgabe nach 7 Tagen zur gleichen Uhrzeit",
    idealFor: "Komplette Projektwoche, Baustelle, Umzug, Firmen",
    highlight: "best_daily", highlightLabel: "Bester Tagespreis",
  },
];

export function getPlanById(planId: string): PlanEntry | null {
  const direct = PLAN_CATALOG.find((p) => p.id === planId);
  if (direct) return direct;
  const m = /^week_x(\d+)$/.exec(planId);
  if (m) {
    const n = Math.max(1, parseInt(m[1], 10));
    const base = PLAN_CATALOG.find((p) => p.id === "multi_7d");
    if (!base) return null;
    const days = n * 7;
    return {
      ...base,
      id: planId,
      label: `${n} × 7 Tage Wochenmiete (${days} Tage)`,
      shortLabel: `${n}× Wochenmiete`,
      days,
      durationHours: days * 24,
      price: base.price * n,
      freeKm: base.freeKm * n,
      returnRule: `Rückgabe nach ${days} Tagen zur gleichen Uhrzeit`,
      idealFor: n > 1 ? `Längere Miete: ${n} volle Wochen` : base.idealFor,
      highlight: undefined,
      highlightLabel: undefined,
    };
  }
  return null;
}

/**
 * Liefert die für eine Nächtezahl + Startstunde verfügbaren Tarife.
 * 0 Nächte (selber Tag) → nur Tagesmiete unter 24h (3h/6h).
 * 1 Nacht → 24h-Tarife (Rückgabe Folgetag gleiche Uhrzeit).
 * 2-7 Nächte → passender Mehrtagestarif (days === nights).
 * 8+ Nächte → dynamisches Wochenpaket mit ceil(nights/7) × Wochenmiete.
 */
export function getAvailablePlans(nights: number, startHour: number | null): PlanEntry[] {
  if (nights < 0) return [];
  let candidates: PlanEntry[];
  if (nights === 0) {
    candidates = PLAN_CATALOG.filter((p) => p.days === 1 && p.durationHours < 24);
  } else if (nights === 1) {
    candidates = PLAN_CATALOG.filter((p) => p.days === 1 && p.durationHours === 24);
  } else if (nights >= 2 && nights <= 7) {
    candidates = PLAN_CATALOG.filter((p) => p.days === nights);
  } else {
    const n = Math.ceil(nights / 7);
    const synth = getPlanById(`week_x${n}`);
    candidates = synth ? [synth] : [];
  }
  if (startHour === null) return candidates;
  return candidates.filter((p) => isStartHourAllowed(p.id, startHour));
}

/** Liefert das exakte Rückgabe-Datum/-Uhrzeit für einen Tarif. */
export function computePlanReturn(planId: PlanId, startDate: Date, startHour: number): Date {
  const start = new Date(startDate);
  start.setHours(startHour, 0, 0, 0);
  // Legacy: km-Tarif → bis spätestens 22:00 desselben Tages
  if (planId === "km") {
    const end = new Date(start);
    end.setHours(LATEST_RETURN_HOUR, 0, 0, 0);
    return end;
  }
  // Legacy: altes "24h"
  if (planId === "24h") return new Date(start.getTime() + 24 * 3600_000);
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
