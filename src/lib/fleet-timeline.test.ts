import { describe, expect, it } from "vitest";
import { depositSummary, vehicleColor } from "./fleet-timeline";

describe("Fahrzeugfarben", () => {
  it("feste Zuordnung", () => {
    expect(vehicleColor("LEO MY 101")).toBe(1);
    expect(vehicleColor("LEO MY 102")).toBe(2);
    expect(vehicleColor("PF MY 1003")).toBe(3);
    expect(vehicleColor("OF-DK 1234")).toBe(4);
    expect(vehicleColor("LEO MY 1004")).toBe(5);
  });
});

describe("Kaution", () => {
  const base = { depositEuro: 200, depositStatus: "held", settlements: [], review: null };
  it("offen ohne Rückzahlung", () => expect(depositSummary(base).label).toBe("Kaution offen"));
  it("bestätigte Stripe-Rückzahlung mit Betrag", () => {
    const s = depositSummary({ ...base, settlements: [{ refund_cents: 15500, status: "succeeded", refund_status: "succeeded", confirmed_at: "2026-10-20T10:00:00Z" }] });
    expect(s.label).toBe("Kaution zurückbezahlt");
    expect(s.refundedCents).toBe(15500);
  });
  it("nur Auftrag ist nicht zurückbezahlt", () => {
    const s = depositSummary({ ...base, settlements: [{ refund_cents: 20000, status: "pending", refund_status: null, confirmed_at: null }] });
    expect(s.refundedCents).toBeNull();
  });
});
