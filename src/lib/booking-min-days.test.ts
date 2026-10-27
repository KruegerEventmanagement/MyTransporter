import { describe, it, expect } from "vitest";
import { planAllowedForClass } from "./booking-rules";

describe("Crafter L5H2 nur ab 5 Tagen", () => {
  it("lehnt Kurzmieten für L5H2 ab", () => {
    for (const p of ["3h", "6h", "24h_300", "multi_2d", "multi_4d"]) expect(planAllowedForClass(p, "l5h2")).toBe(false);
  });
  it("erlaubt ab 5 Tagen", () => {
    expect(planAllowedForClass("multi_5d", "l5h2")).toBe(true);
    expect(planAllowedForClass("multi_7d", "l5h2")).toBe(true);
  });
  it("andere Fahrzeuge unverändert", () => {
    expect(planAllowedForClass("3h", "l1h1")).toBe(true);
    expect(planAllowedForClass("3h", "l4h2")).toBe(true);
  });
});
