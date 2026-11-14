import { describe, it, expect } from "vitest";
import { refundBlockReasons } from "./deposit-refund-block";
const base = { busy: false, itemsError: null, refundError: null, stripeBlocked: false, refundCents: 15000 };
describe("refundBlockReasons", () => {
  it("nennt fehlenden Betrag einer Position", () => {
    expect(refundBlockReasons({ ...base, itemsError: "Sonstiges: Betrag eingeben" })).toEqual(["Sonstiges: Betrag eingeben"]);
  });
  it("gibt vollständige Eingabe frei", () => {
    expect(refundBlockReasons(base)).toEqual([]);
  });
  it("Stripe-Sperre nur bei Betrag > 0", () => {
    expect(refundBlockReasons({ ...base, stripeBlocked: true, refundCents: 0 })).toEqual([]);
    expect(refundBlockReasons({ ...base, stripeBlocked: true })).toHaveLength(1);
  });
});
