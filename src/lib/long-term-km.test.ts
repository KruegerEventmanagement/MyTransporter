import { describe, expect, it } from "vitest";
import { extraKmCostEur, quoteLongTermWithKm, rentalDaysFromDateTimes } from "@/lib/long-term";

describe("Langzeit mit Uhrzeit und Wunsch-km", () => {
  it("zählt 24-h-Blöcke mit 1 h Kulanz", () => {
    expect(rentalDaysFromDateTimes("2026-10-01", "10:00", "2026-10-08", "10:00")).toBe(7);
    expect(rentalDaysFromDateTimes("2026-10-01", "10:00", "2026-10-08", "11:00")).toBe(7);
    expect(rentalDaysFromDateTimes("2026-10-01", "10:00", "2026-10-08", "11:01")).toBe(8);
    expect(rentalDaysFromDateTimes("2026-10-08", "10:00", "2026-10-01", "10:00")).toBeNull();
    expect(rentalDaysFromDateTimes("2026-10-01", "25:00", "2026-10-08", "10:00")).toBeNull();
  });
  it("ist über die Zeitumstellung hinweg stabil", () => {
    expect(rentalDaysFromDateTimes("2026-10-20", "09:00", "2026-10-27", "09:00")).toBe(7);
  });
  it("Staffel", () => {
    expect(extraKmCostEur(1000)).toBe(290);
    expect(extraKmCostEur(2000)).toBe(510);
    expect(extraKmCostEur(6000)).toBe(290 + 880 + 180);
  });
  it("Beispiel 30 Tage / 2.500 km L1H1", () => {
    const q = quoteLongTermWithKm(30, "l1h1", 2500);
    expect(q.eligible && q.totalEur).toBe(924);
  });
  it("Gutschrift gedeckelt auf 10 %", () => {
    const q = quoteLongTermWithKm(30, "l1h1", 0);
    expect(q.eligible && q.creditEur).toBe(99.9);
  });
  it("Mehr-km erhöhen den Preis", () => {
    const q = quoteLongTermWithKm(30, "l1h1", 5000);
    expect(q.eligible && q.totalEur).toBe(999 + 290);
    expect(quoteLongTermWithKm(5, "l1h1", 1000).eligible).toBe(false);
  });
});
