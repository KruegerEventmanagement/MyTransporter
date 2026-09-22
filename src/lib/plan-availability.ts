/**
 * Tarif-/Fahrzeugverfügbarkeit für die Buchungsauswahl.
 *
 * Grundregeln (dauerhaft):
 * - Ein Tarif ist buchbar, wenn MINDESTENS EIN freigegebenes Fahrzeug den
 *   KOMPLETTEN Tarifzeitraum frei hat. Teillücken verschiedener Fahrzeuge
 *   dürfen niemals zu „ein Fahrzeug ist frei“ zusammengerechnet werden.
 * - Es wird niemals auf eine (noch nicht gewählte) Fahrzeugklasse eingeschränkt.
 * - Gesperrte Fahrzeuge (`is_active = false`) zählen nie als verfügbar.
 */
import type { PlanEntry, VehicleClass } from "@/lib/booking-rules";
import { isVehicleFree, type SlotRange } from "@/lib/availability-logic";

export type VehicleLite = {
  plate: string;
  isActive: boolean;
  vehicleClass: VehicleClass;
};

/** Preisreihenfolge der Klassen: kurz < lang < extra lang. */
export const CLASS_PRICE_ORDER: VehicleClass[] = ["l1h1", "l4h2", "l5h2"];

export type BusyMap = Map<string, SlotRange[]>;

/** Alle freigegebenen Fahrzeuge, die den gesamten Zeitraum frei haben. */
export function availableVehiclesForWindow(
  map: BusyMap,
  vehicles: VehicleLite[],
  window: SlotRange,
): VehicleLite[] {
  return vehicles.filter(
    (v) =>
      v.isActive &&
      Boolean(v.plate) &&
      isVehicleFree(map, v.plate, window.start, window.end),
  );
}

/** Klassen, für die im Zeitraum wirklich ein Fahrzeug frei ist (Preisreihenfolge). */
export function availableClassesForWindow(
  map: BusyMap,
  vehicles: VehicleLite[],
  window: SlotRange,
): VehicleClass[] {
  const found = new Set(
    availableVehiclesForWindow(map, vehicles, window).map((v) => v.vehicleClass),
  );
  return CLASS_PRICE_ORDER.filter((c) => found.has(c));
}

/** Ist der Zeitraum mit irgendeinem freigegebenen Fahrzeug buchbar? */
export function isWindowBookable(
  map: BusyMap,
  vehicles: VehicleLite[],
  window: SlotRange,
): boolean {
  return availableVehiclesForWindow(map, vehicles, window).length > 0;
}

/** Preis eines Tarifs für eine Klasse (aus dem unveränderten Preiskatalog). */
export function planPriceForClass(plan: PlanEntry, cls: VehicleClass): number {
  if (cls === "l5h2") return plan.priceL5h2;
  if (cls === "l4h2") return plan.priceL4h2;
  return plan.basePrice;
}

/** Günstigster Preis über die wirklich verfügbaren Klassen (null = nichts frei). */
export function lowestAvailablePlanPrice(
  plan: PlanEntry,
  classes: VehicleClass[],
): number | null {
  if (classes.length === 0) return null;
  return Math.min(...classes.map((c) => planPriceForClass(plan, c)));
}

/**
 * Wählt das Fahrzeug für einen Zeitraum: günstigste verfügbare Klasse zuerst.
 * Eine gültige ausdrückliche Kundenauswahl hat immer Vorrang.
 */
export function pickVehicleForWindow(
  map: BusyMap,
  vehicles: VehicleLite[],
  window: SlotRange,
  opts?: { preferredPlate?: string | null },
): string | null {
  const free = availableVehiclesForWindow(map, vehicles, window);
  if (free.length === 0) return null;
  const preferred = opts?.preferredPlate;
  if (preferred && free.some((v) => v.plate === preferred)) return preferred;
  for (const cls of CLASS_PRICE_ORDER) {
    const hit = free.find((v) => v.vehicleClass === cls);
    if (hit) return hit.plate;
  }
  return free[0].plate;
}

/**
 * Darf ein bereits gewählter Tarif bestehen bleiben?
 * Nur mit frisch geladener Verfügbarkeit aufrufen – ein laufender oder
 * fehlgeschlagener Refresh darf eine gültige Auswahl nicht verwerfen.
 * `window === null` bedeutet: kein prüfbares Zeitfenster → Auswahl behalten.
 */
export function isSelectedPlanStillValid(
  map: BusyMap,
  vehicles: VehicleLite[],
  window: SlotRange | null,
): boolean {
  if (!window) return true;
  return isWindowBookable(map, vehicles, window);
}
