import { describe, it, expect } from "vitest";
import { bookingWindowMs } from "@/lib/booking-window";
import { slotsByPlate, isVehicleFree } from "@/lib/availability-logic";
import type { BusySlot } from "@/lib/availability.functions";

const berlin = (ms: number) =>
  new Date(ms).toLocaleString("de-DE", { timeZone: "Europe/Berlin", hour12: false });

/** Georgiev-Fall aus der Produktion: LEO MY 102, 18.09.2026, 14 Uhr, 6h */
const GEORGIEV = { plate: "LEO MY 102", date: "2026-09-18", hour: 14, plan: "6h" };

function busy(plate: string, date: string, hour: number, plan: string): BusySlot {
  const w = bookingWindowMs(plan, date, hour);
  return { vehiclePlate: plate, start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString() };
}

describe("Berliner Zeitfenster", () => {
  it("14 Uhr am 18.09.2026 ist wirklich 14 Uhr Berliner Zeit (Sommerzeit)", () => {
    const w = bookingWindowMs("6h", GEORGIEV.date, 14);
    expect(berlin(w.start)).toBe("18.9.2026, 14:00:00");
    expect(berlin(w.end)).toBe("18.9.2026, 20:00:00");
    expect(new Date(w.start).toISOString()).toBe("2026-09-18T12:00:00.000Z");
  });

  it("24h-Tarif über Mitternacht", () => {
    const w = bookingWindowMs("24h_300", GEORGIEV.date, 18);
    expect(berlin(w.start)).toBe("18.9.2026, 18:00:00");
    expect(berlin(w.end)).toBe("19.9.2026, 18:00:00");
  });

  it("Winterzeit ohne Verschiebung", () => {
    const w = bookingWindowMs("3h", "2026-01-15", 9);
    expect(berlin(w.start)).toBe("15.1.2026, 09:00:00");
    expect(new Date(w.start).toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });
});

describe("Georgiev-Buchung sperrt LEO MY 102", () => {
  const map = slotsByPlate([busy(GEORGIEV.plate, GEORGIEV.date, GEORGIEV.hour, GEORGIEV.plan)]);
  const free = (hour: number, plan: string, plate = GEORGIEV.plate, date = GEORGIEV.date) => {
    const w = bookingWindowMs(plan, date, hour);
    return isVehicleFree(map, plate, w.start, w.end);
  };

  it("gleiche Startzeit blockiert", () => expect(free(14, "6h")).toBe(false));
  it("Teilüberlappung vorne blockiert", () => expect(free(12, "3h")).toBe(false));
  it("Teilüberlappung hinten blockiert", () => expect(free(19, "3h")).toBe(false));
  it("komplett eingeschlossen blockiert", () => expect(free(15, "3h")).toBe(false));
  it("24h über Mitternacht am Vortag blockiert", () => expect(free(16, "24h_300", GEORGIEV.plate, "2026-09-17")).toBe(false));
  it("direkt angrenzend davor ist frei", () => expect(free(11, "3h")).toBe(true));
  it("direkt angrenzend danach ist frei", () => expect(free(20, "3h")).toBe(true));
  it("anderes Fahrzeug bleibt frei", () => expect(free(14, "6h", "LEO MY 101")).toBe(true));
  it("anderer Tag bleibt frei", () => expect(free(14, "6h", GEORGIEV.plate, "2026-09-19")).toBe(true));
});
