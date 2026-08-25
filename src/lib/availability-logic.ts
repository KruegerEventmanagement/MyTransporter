import type { BusySlot } from "@/lib/availability.functions";

export type SlotRange = { start: number; end: number };

/** Belegte Zeitfenster pro Kennzeichen (in ms). */
export function slotsByPlate(slots: BusySlot[]): Map<string, SlotRange[]> {
  const map = new Map<string, SlotRange[]>();
  for (const s of slots) {
    const plate = s.vehiclePlate ?? "";
    const arr = map.get(plate) ?? [];
    arr.push({ start: new Date(s.start).getTime(), end: new Date(s.end).getTime() });
    map.set(plate, arr);
  }
  return map;
}

function rangesFor(map: Map<string, SlotRange[]>, plate: string): SlotRange[] {
  // Slots ohne Kennzeichen gelten für alle Fahrzeuge (Alt-Daten)
  return [...(map.get(plate) ?? []), ...(map.get("") ?? [])];
}

/** Ist das Fahrzeug im Zeitfenster [startMs, endMs) frei? */
export function isVehicleFree(
  map: Map<string, SlotRange[]>,
  plate: string,
  startMs: number,
  endMs: number,
): boolean {
  return !rangesFor(map, plate).some((r) => startMs < r.end && endMs > r.start);
}

/** Alle Kennzeichen, die im Zeitfenster frei sind. */
export function freeVehiclePlates(
  map: Map<string, SlotRange[]>,
  plates: string[],
  startMs: number,
  endMs: number,
): string[] {
  return plates.filter((p) => isVehicleFree(map, p, startMs, endMs));
}

/** Ab wann ist das Fahrzeug nach startMs wieder frei (Ende der überlappenden Sperre)? */
export function nextFreeFrom(
  map: Map<string, SlotRange[]>,
  plate: string,
  startMs: number,
  endMs: number,
): number | null {
  const overlapping = rangesFor(map, plate).filter((r) => startMs < r.end && endMs > r.start);
  if (overlapping.length === 0) return null;
  let cursor = Math.max(...overlapping.map((r) => r.end));
  // Kettensperren zusammenfassen
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rangesFor(map, plate)) {
      if (r.start <= cursor && r.end > cursor) {
        cursor = r.end;
        changed = true;
      }
    }
  }
  return cursor;
}

/** Ist mindestens ein Fahrzeug an diesem Kalendertag (irgendwann) frei? */
export function isAnyVehicleFreeOnDay(
  map: Map<string, SlotRange[]>,
  plates: string[],
  day: Date,
): boolean {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0).getTime();
  const dayEnd = dayStart + 24 * 3600_000;
  return plates.some((plate) => {
    const ranges = rangesFor(map, plate).filter((r) => r.start < dayEnd && r.end > dayStart);
    if (ranges.length === 0) return true;
    // Deckt eine Sperre den ganzen Tag ab?
    return !ranges.some((r) => r.start <= dayStart && r.end >= dayEnd)
      ? true
      : false;
  });
}
