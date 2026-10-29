import { describe, expect, it } from "vitest";
import { dayOccupancy, slotsByPlate } from "./availability-logic";

const day = new Date(2026, 10, 14); // Sa. 14.11.2026
const slot = (plate: string, s: string, e: string) => ({ vehiclePlate: plate, start: `2026-11-14T${s}:00+01:00`, end: `2026-11-14T${e}:00+01:00` }) as never;

describe("Tagesauslastung 8–22 Uhr", () => {
  it("rechnet zeitgenau: nur 9–12 Uhr gebucht zählt 3 von 14 Stunden", () => {
    const map = slotsByPlate([slot("A", "09:00", "12:00")]);
    const o = dayOccupancy(map, ["A", "B", "C", "D"], day);
    expect(o).toEqual({ total: 4, fullyBooked: 0, partlyBooked: 1, percent: 5 });
  });
  it("drei ganztägig belegte von vier = 75 %", () => {
    const map = slotsByPlate([slot("A", "00:00", "23:00"), slot("B", "08:00", "22:00"), slot("C", "07:00", "23:30")]);
    expect(dayOccupancy(map, ["A", "B", "C", "D"], day)).toEqual({ total: 4, fullyBooked: 3, partlyBooked: 0, percent: 75 });
  });
});
