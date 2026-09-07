import { describe, expect, it } from "vitest";
import type { BusySlot } from "@/lib/availability.functions";
import { slotsByPlate, isVehicleFree, freeVehiclePlates } from "@/lib/availability-logic";
import { BLOCKING_BOOKING_STATUSES } from "@/lib/booking-status";
import { bookingWindowMs } from "@/lib/booking-window";

const at = (day: number, h: number) => new Date(2026, 9, day, h, 0, 0, 0).getTime();

function slot(plate: string, day: number, fromH: number, toH: number): BusySlot {
  return {
    vehiclePlate: plate,
    start: new Date(2026, 9, day, fromH, 0, 0, 0).toISOString(),
    end: new Date(2026, 9, day, toH, 0, 0, 0).toISOString(),
  };
}

describe("Fahrzeugbezogene Verfügbarkeit (skaliert mit beliebig vielen Fahrzeugen)", () => {
  const busy = [slot("LEO MY 101", 10, 9, 15)];

  it("nur das gebuchte Fahrzeug ist gesperrt", () => {
    const map = slotsByPlate(busy);
    expect(isVehicleFree(map, "LEO MY 101", at(10, 10), at(10, 12))).toBe(false);
    expect(isVehicleFree(map, "LEO MY 102", at(10, 10), at(10, 12))).toBe(true);
  });

  it("anderes Fahrzeug bleibt im gleichen Zeitraum buchbar", () => {
    const map = slotsByPlate(busy);
    expect(isVehicleFree(map, "LEO MY 102", at(10, 9), at(10, 15))).toBe(true);
  });

  it("neu angelegte Fahrzeuge erben keine Sperren", () => {
    const map = slotsByPlate(busy);
    const plates = ["LEO MY 101", "LEO MY 102", "LEO MY 103", "LEO MY 104"];
    expect(freeVehiclePlates(map, plates, at(10, 9), at(10, 15))).toEqual([
      "LEO MY 102",
      "LEO MY 103",
      "LEO MY 104",
    ]);
  });

  it("bestehende Sperren bleiben unverändert, wenn Fahrzeuge hinzukommen", () => {
    const withNew = slotsByPlate([...busy, slot("LEO MY 105", 11, 8, 20)]);
    expect(isVehicleFree(withNew, "LEO MY 101", at(10, 10), at(10, 12))).toBe(false);
    expect(isVehicleFree(withNew, "LEO MY 101", at(11, 8), at(11, 20))).toBe(true);
  });
});

describe("Doppelbuchung / parallele Versuche", () => {
  it("zweiter überlappender Versuch auf dasselbe Fahrzeug wird abgelehnt", () => {
    const accepted: BusySlot[] = [];
    const tryBook = (plate: string, day: number, fromH: number, toH: number) => {
      const map = slotsByPlate(accepted);
      const ok = isVehicleFree(
        map,
        plate,
        new Date(2026, 9, day, fromH).getTime(),
        new Date(2026, 9, day, toH).getTime(),
      );
      if (ok) accepted.push(slot(plate, day, fromH, toH));
      return ok;
    };
    expect(tryBook("LEO MY 101", 12, 9, 15)).toBe(true);
    expect(tryBook("LEO MY 101", 12, 12, 18)).toBe(false);
    expect(tryBook("LEO MY 102", 12, 12, 18)).toBe(true);
    expect(accepted).toHaveLength(2);
  });

  it("direkt angrenzende Buchung bleibt möglich ([Start, Ende))", () => {
    const map = slotsByPlate([slot("LEO MY 101", 13, 9, 15)]);
    expect(isVehicleFree(map, "LEO MY 101", at(13, 15), at(13, 18))).toBe(true);
  });
});

describe("Vergangene und stornierte Buchungen", () => {
  it("abgeschlossene/stornierte Status blockieren nicht", () => {
    for (const s of ["cancelled", "completed", "refunded", "expired"]) {
      expect(BLOCKING_BOOKING_STATUSES).not.toContain(s);
    }
  });

  it("laufende Rückgabe blockiert weiterhin", () => {
    expect(BLOCKING_BOOKING_STATUSES).toContain("returning");
    expect(BLOCKING_BOOKING_STATUSES).toContain("return_pending");
  });

  it("vergangene Sperrzeiten beeinflussen zukünftige Fenster nicht", () => {
    const past = slotsByPlate([slot("LEO MY 101", 1, 9, 15)]);
    expect(isVehicleFree(past, "LEO MY 101", at(20, 9), at(20, 15))).toBe(true);
  });
});

describe("Buchungsfenster spiegelt die DB-Logik", () => {
  it("6h-Tarif endet sechs Stunden nach Start (Berliner Zeit)", () => {
    const w = bookingWindowMs("6h", "2026-10-10", 14);
    expect(w.end - w.start).toBe(6 * 3600_000);
  });
  it("Mehrtagestarif blockiert den gesamten Zeitraum", () => {
    const w = bookingWindowMs("multi_3d", "2026-10-10", 9);
    expect(w.end - w.start).toBe(72 * 3600_000);
  });
});
