import { describe, it, expect } from "vitest";
import { shouldShowPostPaymentNotice, POST_PAYMENT_PHOTO_NOTICE, POST_PAYMENT_PHOTO_HEADLINE } from "./return-notice";

describe("Hinweis nach Zahlung", () => {
  it("nur nach Checkout und nur einmal je Buchung", () => {
    expect(shouldShowPostPaymentNotice(true, false)).toBe(true);
    expect(shouldShowPostPaymentNotice(true, true)).toBe(false);
    expect(shouldShowPostPaymentNotice(false, false)).toBe(false);
  });
  it("nennt 30 €", () => {
    expect(POST_PAYMENT_PHOTO_NOTICE).toContain("30 €");
    expect(POST_PAYMENT_PHOTO_HEADLINE).toContain("30 €");
  });
});
