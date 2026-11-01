import { describe, expect, it } from "vitest";
import { getPlanById, planAllowedForClass, type VehicleClass } from "./booking-rules";
import { quoteCustomKm } from "./custom-km";

describe("24h-Paketpreise 01.11.2026", () => {
  it.each([
    ["l1h1", 199, 349], ["l4h2", 209, 359], ["l5h2", 225, 375],
  ] as Array<[VehicleClass, number, number]>)("%s: Preise und vorhandene Größenaufschläge", (cls, p500, p800) => {
    expect(getPlanById("24h_500", cls)?.price).toBe(p500);
    expect(getPlanById("24h_800", cls)?.price).toBe(p800);
    expect(quoteCustomKm("24h_500", cls, 500)?.totalRentCents).toBe(p500 * 100);
    expect(quoteCustomKm("24h_800", cls, 800)?.totalRentCents).toBe(p800 * 100);
  });

  it("Vergleich mit 99 € inklusive 200 km: genau 47 € und 44 €", () => {
    const p500 = getPlanById("24h_500");
    const p800 = getPlanById("24h_800");
    if (!p500 || !p800) throw new Error("Tarife fehlen");
    expect(9900 + (500 - 200) * 49 - p500.price * 100).toBe(4700);
    expect(9900 + (800 - 200) * 49 - p800.price * 100).toBe(4400);
  });

  it("Grundtarif und Crafter-Mindestdauer bleiben unverändert", () => {
    expect(getPlanById("24h_300")?.price).toBe(99);
    expect(getPlanById("24h_300")?.freeKm).toBe(150);
    expect(getPlanById("24h_300")?.extraKmCents).toBe(49);
    expect(planAllowedForClass("24h_500", "l5h2")).toBe(false);
    expect(planAllowedForClass("24h_800", "l5h2")).toBe(false);
  });
});