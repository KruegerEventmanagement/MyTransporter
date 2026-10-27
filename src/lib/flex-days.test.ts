import { describe, it, expect } from "vitest";
import { getAvailablePlans, getPlanById, flexDaysPrice } from "@/lib/booking-rules";
import { planDurationHours } from "@/lib/booking-window";
import { planHours } from "@/lib/trip-time";

describe("Exakte Mietdauer ab 8 Tagen", () => {
  it("16 Tage → genau 16 Tage, 2 × 549 + 189 = 1.287 €, 1.600 km", () => {
    const [p] = getAvailablePlans(16, 9, "l1h1");
    expect(p.id).toBe("days_16");
    expect(p.price).toBe(1287);
    expect(p.freeKm).toBe(1600);
    expect(planDurationHours("days_16")).toBe(16 * 24);
    expect(planHours("days_16")).toBe(16 * 24);
  });
  it("14 Tage = 2 Wochen", () => expect(flexDaysPrice(14, "l1h1")).toBe(1098));
  it("13 Tage nie teurer als 2 volle Wochen", () => expect(flexDaysPrice(13, "l1h1")).toBe(1098));
  it("8 Tage = Woche + Umzugstag", () => expect(flexDaysPrice(8, "l1h1")).toBe(648));
  it("29 Tage nie teurer als 30 Tage", () => expect(flexDaysPrice(29, "l1h1")).toBe(1799));
  it("ab 30 Tagen Monatsstaffel", () => {
    expect(getPlanById("days_30", "l1h1")!.price).toBe(1799);
    expect(getPlanById("days_45", "l1h1")!.price).toBe(2499);
  });
  it("Altbuchung week_x3 bleibt 21 Tage", () => expect(planDurationHours("week_x3")).toBe(504));
});
