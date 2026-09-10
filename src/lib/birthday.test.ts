import { describe, expect, it } from "vitest";

import {
  ageOn,
  berlinDateParts,
  checkCoupon,
  couponValidUntil,
  discountCentsForRent,
  generateCouponCode,
  isBirthdayOn,
  isLeapYear,
  normalizeCouponCode,
  type CouponRow,
} from "./birthday";

describe("Geburtstagslogik", () => {
  it("erkennt Geburtstage unabhängig vom Jahr", () => {
    expect(isBirthdayOn("1990-09-18", { year: 2026, month: 9, day: 18 })).toBe(true);
    expect(isBirthdayOn("1990-09-18", { year: 2026, month: 9, day: 19 })).toBe(false);
  });

  it("feiert 29.02. in Nicht-Schaltjahren am 28.02.", () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isBirthdayOn("2000-02-29", { year: 2026, month: 2, day: 28 })).toBe(true);
    expect(isBirthdayOn("2000-02-29", { year: 2026, month: 3, day: 1 })).toBe(false);
    expect(isBirthdayOn("2000-02-29", { year: 2028, month: 2, day: 29 })).toBe(true);
    expect(isBirthdayOn("2000-02-29", { year: 2028, month: 2, day: 28 })).toBe(false);
  });

  it("rechnet Berliner Kalendertage korrekt", () => {
    // 23:30 UTC am 09.09. ist in Berlin schon der 10.09.
    expect(berlinDateParts(new Date("2026-09-09T23:30:00Z")).iso).toBe("2026-09-10");
  });

  it("berechnet das Alter", () => {
    expect(ageOn("2000-01-01", new Date("2026-01-01T00:00:00Z"))).toBe(26);
    expect(ageOn("2000-12-31", new Date("2026-01-01T00:00:00Z"))).toBe(25);
  });

  it("rabattiert nur die Mietleistung", () => {
    expect(discountCentsForRent(9500, 20)).toBe(1900);
    expect(discountCentsForRent(0, 20)).toBe(0);
  });

  it("berechnet 14 Tage Gültigkeit", () => {
    expect(couponValidUntil("2026-09-18")).toBe("2026-10-02");
    expect(couponValidUntil("2026-12-25")).toBe("2027-01-08");
  });

  it("erzeugt eindeutige Codes", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateCouponCode()));
    expect(codes.size).toBe(200);
    expect([...codes][0]!.startsWith("MTBDAY-")).toBe(true);
  });

  it("normalisiert Eingaben", () => {
    expect(normalizeCouponCode(" mtbday-abc 123 ")).toBe("MTBDAY-ABC123");
  });
});

describe("Gutscheinprüfung", () => {
  const base: CouponRow = {
    coupon_code: "MTBDAY-ABCD1234",
    user_id: "user-1",
    discount_percent: 20,
    valid_from: "2026-09-18",
    valid_until: "2026-10-02",
    redeemed_at: null,
  };

  it("akzeptiert einen gültigen eigenen Gutschein", () => {
    expect(checkCoupon(base, "user-1", "2026-09-25")).toEqual({ ok: true, discountPercent: 20 });
  });

  it("lehnt fremde Gutscheine ab", () => {
    expect(checkCoupon(base, "user-2", "2026-09-25").ok).toBe(false);
  });

  it("lehnt bereits eingelöste Gutscheine ab", () => {
    expect(checkCoupon({ ...base, redeemed_at: "2026-09-20T10:00:00Z" }, "user-1", "2026-09-25").ok)
      .toBe(false);
  });

  it("lehnt abgelaufene und zu frühe Gutscheine ab", () => {
    expect(checkCoupon(base, "user-1", "2026-10-03").ok).toBe(false);
    expect(checkCoupon(base, "user-1", "2026-09-17").ok).toBe(false);
  });

  it("lehnt unbekannte Codes ab", () => {
    expect(checkCoupon(null, "user-1", "2026-09-25").ok).toBe(false);
  });
});
