import { describe, it, expect } from "vitest";
import { priceItems, computeTotals, type ReviewFacts } from "./deposit-review";
const facts: ReviewFacts = { extraKmChargeCents: null, extraKmAlreadyPaid: false, extraKm: null, kmPriceCents: 45, missingTags: [], exceptions: {} };
describe("Mehrkilometer ohne gespeicherte Forderung", () => {
  it("100 km × 0,45 € = 45 € werden mit 200 € Kaution verrechnet, 155 € zurück", () => {
    const items = priceItems([{ type: "extra_km", quantity: 100 }], facts);
    expect(items[0].line_cents).toBe(4500);
    expect(computeTotals(20000, items).refundCents).toBe(15500);
  });
  it("ohne km-Anzahl abgelehnt", () => {
    expect(() => priceItems([{ type: "extra_km" }], facts)).toThrow();
  });
  it("bereits separat eingezogen bleibt gesperrt", () => {
    expect(() => priceItems([{ type: "extra_km", quantity: 100 }], { ...facts, extraKmAlreadyPaid: true })).toThrow();
  });
});
