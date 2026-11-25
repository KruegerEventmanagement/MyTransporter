import { describe, it, expect } from "vitest";
import { planAllowedForClass } from "./booking-rules";

describe("Crafter L5H2 seit 25.11.2026 jederzeit buchbar", () => {
  it("erlaubt auch Kurzmieten für L5H2", () => {
    for (const p of ["3h", "6h", "24h_300", "multi_2d", "multi_4d", "multi_5d"]) expect(planAllowedForClass(p, "l5h2")).toBe(true);
  });
  it("andere Fahrzeuge unverändert", () => {
    expect(planAllowedForClass("3h", "l1h1")).toBe(true);
    expect(planAllowedForClass("3h", "l4h2")).toBe(true);
  });
});
