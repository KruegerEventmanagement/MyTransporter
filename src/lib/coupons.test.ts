import { describe, it, expect } from "vitest";
import { checkThanksCoupon, thanksValidUntil, feedbackDueAt, THANKS_DISCOUNT_PERCENT, type ThanksCouponRow } from "@/lib/coupons";
import { buildFeedbackMail } from "@/lib/customer-mail-outbox";
import { BIRTHDAY_DISCOUNT_PERCENT } from "@/lib/birthday";

const row = (p: Partial<ThanksCouponRow> = {}): ThanksCouponRow => ({
  code: "MTDANKE-AAAA", email_lower: "a@b.de", user_id: "u1", discount_percent: 10,
  valid_from: "2026-10-23", valid_until: "2027-04-23", redeemed_at: null, reserved_until: null, reserved_by: null, ...p,
});

describe("Dankeschön-Gutschein", () => {
  it("10 % und 6 Monate gültig", () => {
    expect(THANKS_DISCOUNT_PERCENT).toBe(10);
    expect(thanksValidUntil("2026-10-23")).toBe("2027-04-23");
    expect(thanksValidUntil("2026-08-31")).toBe("2027-02-28");
  });
  it("Geburtstagsgutschein 10 %", () => expect(BIRTHDAY_DISCOUNT_PERCENT).toBe(10));
  it("nur einmal einlösbar", () => {
    expect(checkThanksCoupon(row({ redeemed_at: "2026-11-01" }), { userId: "u1", emailLower: "a@b.de" }, "2026-11-02").ok).toBe(false);
  });
  it("persönlich, nicht übertragbar", () => {
    expect(checkThanksCoupon(row(), { userId: "u2", emailLower: "x@y.de" }, "2026-11-02").ok).toBe(false);
    expect(checkThanksCoupon(row({ user_id: null }), { userId: "u2", emailLower: "a@b.de" }, "2026-11-02").ok).toBe(true);
  });
  it("abgelaufen nach 6 Monaten", () => {
    expect(checkThanksCoupon(row(), { userId: "u1", emailLower: null }, "2027-04-24").ok).toBe(false);
  });
  it("parallel reserviert durch andere Person ⇒ gesperrt", () => {
    const r = row({ user_id: null, reserved_by: "u9", reserved_until: new Date(Date.now() + 60_000).toISOString() });
    expect(checkThanksCoupon(r, { userId: "u2", emailLower: "a@b.de" }, "2026-11-02").ok).toBe(false);
  });
  it("Feedback 24 h nach Rückgabe, sonst nach Mietende", () => {
    expect(feedbackDueAt(1000, null)).toBe(1000 + 86_400_000);
    expect(feedbackDueAt(1000, new Date(5000).toISOString())).toBe(5000 + 86_400_000);
  });
  it("Gutschein in der Mail ausdrücklich unabhängig von Bewertung", () => {
    const m = buildFeedbackMail({ firstName: "Mario", to: "m@x.de", reviewUrl: "", optOutToken: "00000000-0000-0000-0000-000000000000",
      coupon: { code: "MTDANKE-AAAA", percent: 10, validUntil: "2027-04-23" } });
    expect(m.text).toContain("MTDANKE-AAAA");
    expect(m.text).toContain("Unabhängig von Feedback oder Bewertung");
    expect(m.text).toContain("https://www.google.com/maps?cid=9407266905378611223");
  });
});
