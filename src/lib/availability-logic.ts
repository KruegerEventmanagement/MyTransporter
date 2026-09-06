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
    const ranges = rangesFor(map, plate)
      .filter((r) => r.start < dayEnd && r.end > dayStart)
      .sort((a, b) => a.start - b.start);
    if (ranges.length === 0) return true;
    // Union der Sperren prüfen: bleibt eine Lücke innerhalb des Tages?
    let covered = dayStart;
    for (const r of ranges) {
      if (r.start > covered) return true; // Lücke gefunden
      covered = Math.max(covered, r.end);
      if (covered >= dayEnd) return false;
    }
    return covered < dayEnd;
  });
}

/**
 * Ist für mindestens ein Fahrzeug irgendein buchbares Zeitfenster an diesem
 * Kalendertag möglich? Geprüft wird das kürzeste Angebot (3 Stunden) über alle
 * zulässigen Startstunden.
 */
export function isDayBookable(
  map: Map<string, SlotRange[]>,
  plates: string[],
  day: Date,
  opts: { earliestHour: number; latestReturnHour: number; minDurationHours: number; nowMs?: number },
): boolean {
  const now = opts.nowMs ?? Date.now();
  for (let h = opts.earliestHour; h + opts.minDurationHours <= opts.latestReturnHour; h++) {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 0, 0, 0).getTime();
    if (start < now) continue;
    const end = start + opts.minDurationHours * 3600_000;
    if (plates.some((p) => isVehicleFree(map, p, start, end))) return true;
  }
  return false;
}

/** Ist mindestens ein Fahrzeug für mindestens ein Zeitfenster frei? */
export function anyPlateFreeForWindows(
  map: Map<string, SlotRange[]>,
  plates: string[],
  windows: SlotRange[],
): boolean {
  return windows.some((w) => plates.some((p) => isVehicleFree(map, p, w.start, w.end)));
}
