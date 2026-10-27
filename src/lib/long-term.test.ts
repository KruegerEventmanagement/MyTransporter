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

  it("nutzt die zentralen Wochenpreise (Stand 27.10.2026)", () => {
    expect(weeklyBasePriceEur("l1h1")).toBe(549);
    expect(weeklyBasePriceEur("l4h2")).toBe(619);
    expect(weeklyBasePriceEur("l5h2")).toBe(635);
  });

  it("7 Tage = Wochenpreis, wie in der normalen Buchung", () => {
    const q = quoteLongTerm("2026-10-01", "2026-10-08", "l1h1");
    expect(q.eligible).toBe(true);
    if (!q.eligible) return;
    expect(q.totalEur).toBe(549);
    expect(q.depositEur).toBe(200);
  });

  it("16 Tage = 2 Wochen + 2-Tage-Tarif", () => {
    expect(longTermPriceEur(16, "l1h1")).toBe(2 * 549 + 189);
  });

  it("Monatsstaffel ab 30 Tagen", () => {
    expect(longTermPriceEur(30, "l1h1")).toBe(1799);
    expect(longTermPriceEur(45, "l1h1")).toBe(2499);
    expect(longTermPriceEur(60, "l1h1")).toBe(3199);
    expect(longTermPriceEur(30, "l4h2")).toBe(2199);
    expect(longTermPriceEur(30, "l5h2")).toBe(2499);
    expect(longTermPriceEur(90, "l1h1")).toBe(Math.round((3199 / 60) * 90));
  });

  it("Freikilometer: 2/3 von 4.000 km je 30 Tage, erst am Ende gerundet", () => {
    expect(longTermFreeKm(30)).toBe(2667);
    expect(longTermFreeKm(45)).toBe(4000);
    expect(longTermFreeKm(60)).toBe(5333);
    expect(longTermFreeKm(7)).toBe(622);
    expect(longTermFreeKm(14)).toBe(1244);
    expect(longTermFreeKm(90)).toBe(8000);
    expect(longTermFreeKm(0)).toBe(0);
  });

  it("ab einem Monat ist der Tagespreis günstiger als bei Wochenmiete", () => {
    expect(longTermPriceEur(30, "l1h1") / 30).toBeLessThan(549 / 7);
    expect(longTermPriceEur(29, "l1h1")).toBeLessThanOrEqual(longTermPriceEur(30, "l1h1"));
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
