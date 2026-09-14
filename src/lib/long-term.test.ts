import { describe, expect, it } from "vitest";
import {
  longTermFreeKm,
  longTermPriceEur,
  longTermTierLabel,
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

  it("7 Tage = Wochenpreis minus 10 %", () => {
    const q = quoteLongTerm("2026-10-01", "2026-10-08", "l1h1");
    expect(q.eligible).toBe(true);
    if (!q.eligible) return;
    expect(q.days).toBe(7);
    expect(q.totalEur).toBe(449.1);
    expect(q.referencePriceEur).toBe(499);
    expect(q.savingsEur).toBe(49.9);
    expect(q.isExactWeekDiscount).toBe(true);
    expect(q.depositEur).toBe(200);
    expect(longTermPriceEur(7, "l4h2")).toBe(512.1);
    expect(longTermPriceEur(7, "l5h2")).toBe(526.5);
  });

  it("trifft die Ankerpreise für 30, 45 und 60 Tage exakt", () => {
    expect(longTermPriceEur(30, "l1h1")).toBe(949);
    expect(longTermPriceEur(45, "l1h1")).toBe(1399);
    expect(longTermPriceEur(60, "l1h1")).toBe(1799);
    expect(longTermPriceEur(30, "l4h2")).toBe(1049);
    expect(longTermPriceEur(45, "l4h2")).toBe(1549);
    expect(longTermPriceEur(60, "l4h2")).toBe(1999);
    expect(longTermPriceEur(30, "l5h2")).toBe(1149);
    expect(longTermPriceEur(45, "l5h2")).toBe(1699);
    expect(longTermPriceEur(60, "l5h2")).toBe(2199);
  });

  it("interpoliert tagesgenau zwischen den Ankern", () => {
    // 14 Tage L1H1: 449,10 + (949 − 449,10) × 7/23
    expect(longTermPriceEur(14, "l1h1")).toBeCloseTo(601.24, 2);
    // 37 Tage L4H2: 1049 + (1549 − 1049) × 7/15
    expect(longTermPriceEur(37, "l4h2")).toBeCloseTo(1282.33, 2);
    // 50 Tage L5H2: 1699 + (2199 − 1699) × 5/15
    expect(longTermPriceEur(50, "l5h2")).toBeCloseTo(1865.67, 2);
  });

  it("über 60 Tage bleibt der Tagespreis auf 60-Tage-Niveau", () => {
    expect(longTermPriceEur(90, "l1h1")).toBeCloseTo((1799 / 60) * 90, 2);
    const perDay60 = 2199 / 60;
    expect(longTermPriceEur(75, "l5h2") / 75).toBeCloseTo(perDay60, 4);
    expect(longTermPriceEur(120, "l4h2") / 120).toBeCloseTo(1999 / 60, 4);
  });

  it("der effektive Tagespreis sinkt mit der Mietdauer", () => {
    let prev = Infinity;
    for (const days of [7, 10, 14, 21, 30, 37, 45, 52, 60]) {
      const perDay = longTermPriceEur(days, "l1h1") / days;
      expect(perDay).toBeLessThan(prev);
      prev = perDay;
    }
  });

  it("kennzeichnet runde Laufzeiten", () => {
    expect(longTermTierLabel(30)).toBe("Monatspreis");
    expect(longTermTierLabel(45)).toBe("1,5-Monats-Preis");
    expect(longTermTierLabel(60)).toBe("2-Monats-Preis");
    expect(longTermTierLabel(31)).toBeNull();
  });

  it("unter 7 Tagen und bei ungültigem Zeitraum kein Preis", () => {
    const short = quoteLongTerm("2026-10-01", "2026-10-05", "l1h1");
    expect(short).toEqual({ eligible: false, days: 4, reason: "below_minimum" });
    const bad = quoteLongTerm("2026-10-08", "2026-10-01", "l4h2");
    expect(bad).toEqual({ eligible: false, days: null, reason: "invalid_range" });
  });
});
