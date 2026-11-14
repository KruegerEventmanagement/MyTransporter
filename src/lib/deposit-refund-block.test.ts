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

import { parseLenientEuro } from "./deposit-refund-block";
describe("parseLenientEuro", () => {
  it("reine Zahl", () => expect(parseLenientEuro("20")).toBe(2000));
  it("Zahl mit Text", () => expect(parseLenientEuro("20 euro reine Tankkosten die gefehlt haben laut Kunde danach.")).toBe(2000));
  it("Komma-Betrag mit €", () => expect(parseLenientEuro("20,50 €")).toBe(2050));
  it("keine Zahl", () => expect(parseLenientEuro("Tank leer")).toBeNull());
  it("mehrere Zahlen werden nicht geraten", () => expect(parseLenientEuro("20 oder 30")).toBeNull());
});
