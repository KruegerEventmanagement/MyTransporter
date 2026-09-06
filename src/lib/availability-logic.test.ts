import { describe, expect, it } from "vitest";
import type { BusySlot } from "@/lib/availability.functions";
import {
  slotsByPlate,
  isVehicleFree,
  isDayBookable,
  anyPlateFreeForWindows,
} from "@/lib/availability-logic";
import { BLOCKING_BOOKING_STATUSES } from "@/lib/booking-status";

/** Georgiev-Buchung: LEO MY 102, 18.09.2026, 6h-Tarif ab 14:00 → 14:00–20:00. */
const georgiev: BusySlot = {
  vehiclePlate: "LEO MY 102",
  start: new Date(2026, 8, 18, 14, 0, 0, 0).toISOString(),
  end: new Date(2026, 8, 18, 20, 0, 0, 0).toISOString(),
};

const map = slotsByPlate([georgiev]);
const plates = ["LEO MY 101", "LEO MY 102"];
const at = (h: number, m = 0, day = 18) => new Date(2026, 8, day, h, m, 0, 0).getTime();

describe("Intervall-Konflikte (Georgiev 18.09.2026 14–20, LEO MY 102)", () => {
  it("gleiche Startzeit ist belegt", () => {
    expect(isVehicleFree(map, "LEO MY 102", at(14), at(20))).toBe(false);
  });
  it("späterer Start innerhalb der Buchung ist belegt", () => {
    expect(isVehicleFree(map, "LEO MY 102", at(16), at(19))).toBe(false);
  });
  it("früherer Start mit hineinragendem Ende ist belegt", () => {
    expect(isVehicleFree(map, "LEO MY 102", at(12), at(15))).toBe(false);
  });
  it("vollständiges Umschließen ist belegt", () => {
    expect(isVehicleFree(map, "LEO MY 102", at(8), at(8, 0, 19))).toBe(false);
  });
  it("exakt angrenzend danach ist erlaubt", () => {
    expect(isVehicleFree(map, "LEO MY 102", at(20), at(22))).toBe(true);
  });
  it("exakt angrenzend davor ist erlaubt", () => {
    expect(isVehicleFree(map, "LEO MY 102", at(11), at(14))).toBe(true);
  });
  it("anderes Fahrzeug bleibt im selben Zeitraum buchbar", () => {
    expect(isVehicleFree(map, "LEO MY 101", at(14), at(20))).toBe(true);
  });
});

describe("Tages- und Fenster-Aggregation", () => {
  const opts = { earliestHour: 8, latestReturnHour: 22, minDurationHours: 3, nowMs: at(0, 0, 1) };

  it("Tag bleibt buchbar, solange ein Fahrzeug frei ist", () => {
    expect(isDayBookable(map, plates, new Date(2026, 8, 18), opts)).toBe(true);
  });

  it("Tag ist gesperrt, wenn beide Fahrzeuge ganztags belegt sind", () => {
    const full = slotsByPlate(
      plates.map((p) => ({
        vehiclePlate: p,
        start: new Date(2026, 8, 18, 0, 0, 0, 0).toISOString(),
        end: new Date(2026, 8, 19, 0, 0, 0, 0).toISOString(),
      })),
    );
    expect(isDayBookable(full, plates, new Date(2026, 8, 18), opts)).toBe(false);
  });

  it("Slot ohne Kennzeichen (Altdaten) blockiert alle Fahrzeuge", () => {
    const legacy = slotsByPlate([{ vehiclePlate: "", start: georgiev.start, end: georgiev.end }]);
    expect(anyPlateFreeForWindows(legacy, plates, [{ start: at(15), end: at(17) }])).toBe(false);
  });

  it("nur ein Fahrzeug belegt → Fenster bleibt buchbar", () => {
    expect(anyPlateFreeForWindows(map, plates, [{ start: at(15), end: at(17) }])).toBe(true);
  });

  it("aktiver Hold blockiert wie eine Buchung", () => {
    const withHold = slotsByPlate([
      georgiev,
      {
        vehiclePlate: "LEO MY 101",
        start: new Date(2026, 8, 18, 15, 0, 0, 0).toISOString(),
        end: new Date(2026, 8, 18, 18, 0, 0, 0).toISOString(),
      },
    ]);
    expect(anyPlateFreeForWindows(withHold, plates, [{ start: at(16), end: at(17) }])).toBe(false);
  });
});

describe("Blockierende Buchungsstatus", () => {
  it("returning blockiert (Fahrzeug noch nicht zurück)", () => {
    expect(BLOCKING_BOOKING_STATUSES).toContain("returning");
  });
  it("cancelled und completed blockieren nicht", () => {
    expect(BLOCKING_BOOKING_STATUSES).not.toContain("cancelled" as never);
    expect(BLOCKING_BOOKING_STATUSES).not.toContain("completed" as never);
  });
});
