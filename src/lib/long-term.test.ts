import { describe, expect, it } from "vitest";
import {
  LONG_TERM_DISCOUNT_PERCENT,
  quoteLongTerm,
  rentalDaysBetween,
  weeklyBasePriceEur,
} from "@/lib/long-term";
import { ageOnIsoDate, meetsMinimumAge } from "@/lib/age";

describe("Alter / Mindestalter 25", () => {
  it("rechnet kalendergenau", () => {
    expect(ageOnIsoDate("2001-09-14", "2026-09-14")).toBe(25);
    expect(ageOnIsoDate("2001-09-15", "2026-09-14")).toBe(24);
    expect(ageOnIsoDate("2000-02-29", "2026-02-28")).toBe(25);
  });

  it("lässt genau ab dem 25. Geburtstag zu", () => {
    expect(meetsMinimumAge("2001-09-14", "2026-09-14")).toBe(true);
    expect(meetsMinimumAge("2001-09-15", "2026-09-14")).toBe(false);
    expect(meetsMinimumAge("2005-01-01", "2026-09-14")).toBe(false);
  });

  it("lehnt ungültige und zukünftige Datumsangaben ab", () => {
    expect(ageOnIsoDate("2030-01-01", "2026-09-14")).toBeNull();
    expect(ageOnIsoDate("1990-13-01", "2026-09-14")).toBeNull();
    expect(ageOnIsoDate("", "2026-09-14")).toBeNull();
    expect(meetsMinimumAge("2030-01-01", "2026-09-14")).toBe(false);
  });
});

describe("Langzeitmiete", () => {
  it("zählt volle Miettage", () => {
    expect(rentalDaysBetween("2026-10-01", "2026-10-08")).toBe(7);
    expect(rentalDaysBetween("2026-10-01", "2026-10-01")).toBeNull();
    expect(rentalDaysBetween("2026-10-08", "2026-10-01")).toBeNull();
    expect(rentalDaysBetween("kaputt", "2026-10-08")).toBeNull();
  });

  it("nutzt die zentralen Wochenpreise", () => {
    expect(weeklyBasePriceEur("l1h1")).toBe(499);
    expect(weeklyBasePriceEur("l4h2")).toBe(569);
    expect(weeklyBasePriceEur("l5h2")).toBe(585);
  });

  it("7 Tage L1H1: 499 € → 10 % → 449,10 €", () => {
    const q = quoteLongTerm("2026-10-01", "2026-10-08", "l1h1");
    expect(q.eligible).toBe(true);
    if (!q.eligible) return;
    expect(q.days).toBe(7);
    expect(q.normalPriceEur).toBe(499);
    expect(q.discountPercent).toBe(LONG_TERM_DISCOUNT_PERCENT);
    expect(q.discountEur).toBe(49.9);
    expect(q.totalEur).toBe(449.1);
    expect(q.depositEur).toBe(200);
  });

  it("rundet nicht auf volle Wochen auf (10 und 14 Tage, alle Klassen)", () => {
    const cases: Array<[Parameters<typeof quoteLongTerm>[2], number, number, number]> = [
      ["l1h1", 10, 712.86, 641.57],
      ["l4h2", 10, 812.86, 731.57],
      ["l5h2", 10, 835.71, 752.14],
      ["l1h1", 14, 998, 898.2],
      ["l4h2", 14, 1138, 1024.2],
      ["l5h2", 14, 1170, 1053],
    ];
    for (const [cls, days, normal, total] of cases) {
      const end = new Date(Date.UTC(2026, 9, 1) + days * 86_400_000).toISOString().slice(0, 10);
      const q = quoteLongTerm("2026-10-01", end, cls);
      expect(q.eligible).toBe(true);
      if (!q.eligible) continue;
      expect(q.days).toBe(days);
      expect(q.normalPriceEur).toBeCloseTo(normal, 2);
      expect(q.totalEur).toBeCloseTo(total, 2);
    }
  });

  it("unter 7 Tagen und bei ungültigem Zeitraum kein Preis", () => {
    const short = quoteLongTerm("2026-10-01", "2026-10-05", "l1h1");
    expect(short).toEqual({ eligible: false, days: 4, reason: "below_minimum" });
    const bad = quoteLongTerm("2026-10-08", "2026-10-01", "l4h2");
    expect(bad).toEqual({ eligible: false, days: null, reason: "invalid_range" });
  });
});
