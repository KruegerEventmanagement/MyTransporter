import { describe, it, expect } from "vitest";
import {
  priceItems, computeTotals, documentationFeeAllowed, buildCustomerClosingMail, buildAdminReviewMail,
  resolveRefund, depositReminderDueAt, shouldSendClosingMail, draftKey,
  payoutSentence, digestSourceId, berlinDateAndHour, photoChecklist, type ReviewFacts,
} from "./deposit-review";
import { requestDepositSettlement, syncOpenSettlements, type Deps, type SettlementRow, type BookingRow, type RefundLike } from "./deposit-settlement.server";

const facts = (p: Partial<ReviewFacts> = {}): ReviewFacts => ({ extraKmChargeCents: null, extraKmAlreadyPaid: false, extraKm: null, missingTags: [], exceptions: {}, ...p });

describe("Abzugspositionen", () => {
  it("Rauchen 100 €, Verspätung 25 € je Stunde, Kraftstoff + 20 €", () => {
    const items = priceItems([{ type: "smoking" }, { type: "late_return", quantity: 3 }, { type: "fuel", amount_cents: 4512 }], facts());
    expect(items.map((i) => i.line_cents)).toEqual([10000, 7500, 6512]);
  });
  it("Reinigung/Sonstiges brauchen Begründung und Betrag", () => {
    expect(() => priceItems([{ type: "cleaning", amount_cents: 3000 }], facts())).toThrow(/Begründung/);
    expect(() => priceItems([{ type: "other", reason: "Kratzer", amount_cents: 0 }], facts())).toThrow(/Betrag/);
    expect(priceItems([{ type: "cleaning", amount_cents: 3000, reason: "Laderaum verschmutzt" }], facts())[0].line_cents).toBe(3000);
  });
  it("lehnt negative, NaN und zu hohe Beträge ab", () => {
    for (const a of [-1, Number.NaN, 1.5, 5_000_01]) expect(() => priceItems([{ type: "damage", reason: "Delle", amount_cents: a }], facts())).toThrow();
    expect(() => priceItems([{ type: "late_return", quantity: 0 }], facts())).toThrow();
  });
  it("Mehrkilometer nur aus Snapshot, Client-Betrag ignoriert, nie wenn bereits bezahlt", () => {
    expect(priceItems([{ type: "extra_km", amount_cents: 1 }], facts({ extraKmChargeCents: 2250 }))[0].line_cents).toBe(2250);
    expect(() => priceItems([{ type: "extra_km" }], facts({ extraKmChargeCents: 2250, extraKmAlreadyPaid: true }))).toThrow(/bereits/);
  });
  it("30-€-Pauschale nie bei technischem Problem", () => {
    const tech = facts({ missingTags: ["tank_receipt"], exceptions: { receipt: "[Technisches Problem] Kamera" } });
    expect(documentationFeeAllowed(tech).allowed).toBe(false);
    expect(() => priceItems([{ type: "documentation_fee", reason: "fehlt" }], tech)).toThrow();
    const np = facts({ missingTags: ["tank_receipt"], exceptions: { receipt: "[Nachweis nicht bereitgestellt] verloren" } });
    expect(priceItems([{ type: "documentation_fee", reason: "Tankbeleg fehlt" }], np)[0].line_cents).toBe(3000);
    expect(documentationFeeAllowed(facts()).allowed).toBe(false);
  });
});

describe("Summen", () => {
  it("Abzug über Kaution wird nicht abgeschnitten, Rest als Forderung", () => {
    const t = computeTotals(20000, priceItems([{ type: "damage", reason: "Spiegel", amount_cents: 25000 }], facts()));
    expect(t).toEqual({ depositCents: 20000, totalCents: 25000, appliedCents: 20000, outstandingCents: 5000, refundCents: 0 });
  });
  it("ohne Abzug volle Rückzahlung", () => expect(computeTotals(20000, []).refundCents).toBe(20000));
});

describe("Zeitzone und Checkliste", () => {
  it("Berliner Datum/Stunde inkl. Sommer-/Winterzeit", () => {
    expect(berlinDateAndHour(Date.parse("2026-07-01T08:00:00Z"))).toEqual({ date: "2026-07-01", hour: 10 });
    expect(berlinDateAndHour(Date.parse("2026-12-01T09:00:00Z"))).toEqual({ date: "2026-12-01", hour: 10 });
    expect(digestSourceId("2026-10-18")).toBe("00000000-0000-4000-8000-000020261018");
  });
  it("Tachofoto alter Rückgaben zählt", () => {
    expect(photoChecklist(["post_odometer"]).find((c) => c.tag === "post_dashboard")!.present).toBe(true);
  });
});

describe("Mails", () => {
  const base = { to: "k@example.com", firstName: "Anna", vehicle: "Fiat · LEO 1", startMs: Date.parse("2026-10-26T08:00:00Z"), endMs: Date.parse("2026-10-27T08:00:00Z"), message: null, adjustment: null, channel: "stripe" as const };
  it("pending heißt beauftragt, nicht zurückgezahlt", () => {
    const s = payoutSentence({ kind: "stripe_pending" }, 17000, "stripe");
    expect(s).toMatch(/beauftragt/);
    expect(s).not.toMatch(/bestätigt/);
  });
  it("Kundenmail: Positionen, keine Gedankenstriche, keine interne Quelle", () => {
    const items = priceItems([{ type: "smoking" }], facts());
    const m = buildCustomerClosingMail({ ...base, totals: computeTotals(20000, items), items, payout: { kind: "stripe_succeeded" } });
    expect(m.text).toContain("100,00 €");
    expect(m.text).toContain("Rückzahlung: 100,00 €");
    expect(m.text).not.toMatch(/[–—]/);
    expect(m.text).not.toMatch(/AGB §|\.ts|Snapshot/);
    expect(m.from).toBe("Christian Krüger – MyTransporter <info@mytransporter.org>");
  });
  it("Adminmail ehrlich bei unbestätigter Rückgabe, Link nur Navigation", () => {
    const m = buildAdminReviewMail({ sourceType: "booking", sourceId: "11111111-1111-4111-8111-111111111111", customerName: "Anna B", bookingRef: "MT-1", vehicle: "Fiat", startMs: base.startMs, endMs: base.endMs, returnReportedMs: null, priceLine: "99 €", depositLine: "200 €", checklist: photoChecklist([]), issues: [] });
    expect(m.subject).toBe("Wie ist die Fahrt von Anna B verlaufen? Kaution prüfen");
    expect(m.to).toBe("info@mytransporter.org");
    expect(m.text).toMatch(/noch nicht bestätigt/);
    expect(m.text).toContain("/admin?kaution=booking%3A11111111");
  });
});

// ---- Geldfluss mit Fake-Stripe ----
function harness(opts: { piStatus?: string; failFirstCreateAfterStripe?: boolean } = {}) {
  const booking: BookingRow = { id: "b1", user_id: "u1", status: "completed", start_date: "2026-10-01", start_hour: 10, start_km: 1, plan_price: 99, deposit: 200, deposit_status: "held", deposit_deducted_cents: null, deposit_refund_id: null, stripe_payment_intent_id: "pi_1", stripe_environment: "live", remarks: null, addons: [] };
  const rows: SettlementRow[] = [];
  const refunds: RefundLike[] = [];
  let creates = 0;
  let n = 0;
  const d: Deps = {
    newId: () => `s${++n}`,
    store: {
      getBooking: async () => booking,
      setBookingEnvironment: async () => {},
      updateBooking: async (_id, p) => void Object.assign(booking, p),
      listSettlements: async () => rows.slice(),
      getSettlement: async (id) => rows.find((r) => r.id === id) ?? null,
      findByRefundId: async (id) => rows.find((r) => r.refund_id === id) ?? null,
      insertSettlement: async (r) => {
        if (rows.some((x) => x.booking_id === r.booking_id && ["processing", "pending", "requires_action", "needs_review"].includes(x.status))) return null;
        const row = { requested_at: "", stripe_called_at: null, confirmed_at: null, last_synced_at: null, refund_status: null, failure_reason: null, ...r } as SettlementRow;
        rows.push(row);
        return row;
      },
      updateSettlement: async (id, p) => Object.assign(rows.find((r) => r.id === id)!, p),
      markStripeCalled: async (id, at) => Object.assign(rows.find((r) => r.id === id)!, { stripe_called_at: rows.find((r) => r.id === id)!.stripe_called_at ?? at }),
      listOpen: async () => rows.filter((r) => ["processing", "pending", "requires_action"].includes(r.status)),
      notifyAdmin: async () => {},
    },
    stripe: {
      createRefund: async (_e, p, key) => {
        creates++;
        const ex = refunds.find((r) => r.metadata?.key === key);
        if (ex) return ex;
        const r: RefundLike = { id: `re_${creates}`, status: "pending", amount: p.amount, payment_intent: p.payment_intent, metadata: { ...p.metadata, key } };
        refunds.push(r);
        if (opts.failFirstCreateAfterStripe && creates === 1) throw Object.assign(new Error("timeout"), { type: "StripeConnectionError" });
        return r;
      },
      retrieveRefund: async (_e, id) => refunds.find((r) => r.id === id) ?? null,
      listRefunds: async () => refunds.slice(),
      retrievePaymentIntent: async () => ({ id: "pi_1", amount_received: 29900, status: opts.piStatus ?? "succeeded", currency: "eur" }),
    },
  };
  return { d, rows, refunds, booking, creates: () => creates };
}

describe("Kautionserstattung", () => {
  it("erstattet nur den Kautionsanteil, Doppelklick erzeugt keinen zweiten Refund", async () => {
    const h = harness();
    const a = await requestDepositSettlement(h.d, { bookingId: "b1", deductCents: 3000, adminId: "a", requestKey: "review-r1" });
    const b = await requestDepositSettlement(h.d, { bookingId: "b1", deductCents: 3000, adminId: "a", requestKey: "review-r1" });
    expect(a.settlement.refund_cents).toBe(17000);
    expect(b.settlement.id).toBe(a.settlement.id);
    expect(h.refunds).toHaveLength(1);
    expect(a.settlement.status).toBe("pending");
    expect(h.booking.deposit_status).toBe("refund_pending");
  });
  it("Timeout nach Stripe: Wiederholung findet denselben Refund", async () => {
    const h = harness({ failFirstCreateAfterStripe: true });
    const a = await requestDepositSettlement(h.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k" });
    expect(a.settlement.status).toBe("processing");
    await requestDepositSettlement(h.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k" });
    expect(h.refunds).toHaveLength(1);
    expect(h.rows[0].refund_id).toBe("re_1");
  });
  it("nicht abgeschlossene Zahlung (requires_capture) ⇒ manuell prüfen, kein Refund", async () => {
    const h = harness({ piStatus: "requires_capture" });
    const a = await requestDepositSettlement(h.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k" });
    expect(a.settlement.status).toBe("needs_review");
    expect(h.creates()).toBe(0);
  });
  it("Statusabgleich löst nie eine neue Erstattung aus", async () => {
    const h = harness();
    h.rows.push({ id: "x", booking_id: "b1", kind: "deposit", environment: "live", payment_intent_id: "pi_1", idempotency_key: "mt-deposit-x", request_key: "k", deposit_cents: 20000, deduct_cents: 0, fee_cents: 0, refund_cents: 20000, status: "processing", refund_id: null, refund_status: null, failure_reason: null, requested_by: "a", requested_at: "", stripe_called_at: null, confirmed_at: null, last_synced_at: null });
    await syncOpenSettlements(h.d);
    expect(h.creates()).toBe(0);
  });
  it("Abzug über Kaution wird vom Auftrag abgelehnt", async () => {
    const h = harness();
    await expect(requestDepositSettlement(h.d, { bookingId: "b1", deductCents: 20001, adminId: "a", requestKey: "k" })).rejects.toThrow();
  });
});

// ---- Review 263e9e9 ----
import { bookingDepositState, closingMailStillValid, adminMailStillValid, safePhotoRows, draftKey } from "./deposit-review";
import { executeSettlement } from "./deposit-settlement.server";

describe("Review-Korrekturen", () => {
  it("1: finalisiert + fehlgeschlagene Rückzahlung bleibt offen, Erfolg schließt", () => {
    const r = { status: "finalized", settlement_id: "s1" };
    expect(bookingDepositState(r, [{ id: "s1", status: "failed" }], "held")).toBe("Rückzahlung fehlgeschlagen");
    expect(bookingDepositState(r, [{ id: "s1", status: "canceled" }], "held")).toBe("Rückzahlung abgebrochen");
    expect(bookingDepositState(r, [{ id: "s1", status: "requires_action" }], "held")).toMatch(/Aktion/);
    expect(bookingDepositState(r, [], "held")).toMatch(/Verknüpfung ungültig/);
    expect(bookingDepositState({ status: "finalized", settlement_id: null }, [], "held")).toMatch(/fortsetzen/);
    expect(bookingDepositState(r, [{ id: "s1", status: "succeeded" }], "released")).toBeNull();
    expect(bookingDepositState(r, [{ id: "s1", status: "no_refund" }], "released")).toBeNull();
    expect(bookingDepositState(null, [{ id: "s0", status: "failed" }], "held")).toBe("Rückzahlung fehlgeschlagen");
  });

  it("2: 29900 erhalten, fremder 7000-Refund, Auftrag 20000 ⇒ KEIN neuer Refund", async () => {
    const h = harness();
    h.refunds.push({ id: "re_x", status: "succeeded", amount: 7000, payment_intent: "pi_1", metadata: {} });
    const a = await requestDepositSettlement(h.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k" });
    expect(a.settlement.status).toBe("needs_review");
    expect(h.creates()).toBe(0);
  });
  it("2: fremder pending-Refund blockiert, fremder failed nicht", async () => {
    const h1 = harness();
    h1.refunds.push({ id: "re_p", status: "pending", amount: 100, payment_intent: "pi_1", metadata: {} });
    expect((await requestDepositSettlement(h1.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k" })).settlement.status).toBe("needs_review");
    const h2 = harness();
    h2.refunds.push({ id: "re_f", status: "failed", amount: 100, payment_intent: "pi_1", metadata: {} });
    expect((await requestDepositSettlement(h2.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k" })).settlement.status).toBe("pending");
  });

  it("3: Nullerstattung + requires_capture ⇒ kein no_refund", async () => {
    const h = harness({ piStatus: "requires_capture" });
    const a = await requestDepositSettlement(h.d, { bookingId: "b1", deductCents: 20000, adminId: "a", requestKey: "k" });
    expect(a.settlement.status).toBe("needs_review");
    expect(h.booking.deposit_status).toBe("held");
  });
  it("3: Nullerstattung ohne Originalzahlung ⇒ kein no_refund", async () => {
    const h = harness();
    h.booking.stripe_payment_intent_id = null;
    const a = await requestDepositSettlement(h.d, { bookingId: "b1", deductCents: 20000, adminId: "a", requestKey: "k" });
    expect(a.settlement.status).toBe("needs_review");
    expect(h.booking.deposit_status).toBe("held");
  });
  it("3: Nullerstattung mit belegter Zahlung ⇒ no_refund", async () => {
    const h = harness();
    const a = await requestDepositSettlement(h.d, { bookingId: "b1", deductCents: 20000, adminId: "a", requestKey: "k" });
    expect(a.settlement.status).toBe("no_refund");
    expect(h.creates()).toBe(0);
    expect(await executeSettlement(h.d, a.settlement, { mayCreate: false })).toBe(a.settlement);
  });

  it("4: gleich teure, nur in der Begründung geänderte Position ⇒ anderer Entwurf", () => {
    const saved = draftKey([{ type: "cleaning", amount_cents: 3000, reason: "Laderaum" }], null);
    expect(draftKey([{ type: "cleaning", amount_cents: 3000, reason: "Laderaum" }], null)).toBe(saved);
    expect(draftKey([{ type: "cleaning", amount_cents: 3000, reason: "Sitz" }], null)).not.toBe(saved);
    expect(draftKey([{ type: "missing_accessory", amount_cents: 3000, reason: "Laderaum" }], null)).not.toBe(saved);
    expect(draftKey([{ type: "cleaning", amount_cents: 3000, reason: "Laderaum" }], "Hallo")).not.toBe(saved);
  });

  it("5: eingefrorene pending-Kundenmail nach Fehlschlag nicht senden", () => {
    const items = priceItems([], facts());
    const m = buildCustomerClosingMail({ to: "k@x.de", firstName: null, vehicle: "V", startMs: 0, endMs: 1, totals: computeTotals(20000, items), items, message: null, adjustment: null, payout: { kind: "stripe_pending" }, channel: "stripe" });
    expect(closingMailStillValid({ reviewFinalized: true, payout: null, refundCents: 20000, frozenText: m.text })).toMatch(/fehlgeschlagen/);
    expect(closingMailStillValid({ reviewFinalized: true, payout: { kind: "stripe_pending" }, refundCents: 20000, frozenText: m.text })).toBeNull();
    expect(closingMailStillValid({ reviewFinalized: true, payout: { kind: "stripe_pending" }, refundCents: 15000, frozenText: m.text })).toMatch(/Betrag/);
  });
  it("5: Adminhinweis bei Storno, Verlängerung oder Abschluss abbrechen", () => {
    const endMs = Date.parse("2026-10-27T08:00:00Z");
    const m = buildAdminReviewMail({ sourceType: "booking", sourceId: "x", customerName: "A", bookingRef: "R", vehicle: "V", startMs: endMs - 864e5, endMs, returnReportedMs: null, priceLine: "", depositLine: "", checklist: null, issues: [] });
    const base = { bookingStatus: "completed", depositStatus: "held", reviewFinalized: false, endMs, returnReportedMs: null, nowMs: endMs + 1, frozenText: m.text };
    expect(adminMailStillValid(base)).toBeNull();
    expect(adminMailStillValid({ ...base, bookingStatus: "cancelled" })).toMatch(/storniert/);
    expect(adminMailStillValid({ ...base, endMs: endMs + 7200e3, nowMs: endMs + 3600e3 })).toMatch(/verschoben/);
    expect(adminMailStillValid({ ...base, endMs: endMs + 3600e3, nowMs: endMs + 7200e3 })).toMatch(/geändert/);
    expect(adminMailStillValid({ ...base, reviewFinalized: true })).toMatch(/abgeschlossen/);
  });

  it("6: Fotovorschau nur für bestätigte Objekte dieser Buchung (Testfixture)", () => {
    const bid = "aaaaaaaa-0000-4000-8000-000000000001";
    const rows = [
      { photo_type: "post_front", photo_url: `${bid}/front.jpg` },
      { photo_type: "post_back", photo_url: `bbbbbbbb-0000-4000-8000-000000000002/back.jpg` },
      { photo_type: "post_left", photo_url: `${bid}/../x/left.jpg` },
      { photo_type: "post_right", photo_url: `https://example.com/right.jpg` },
      { photo_type: "tank_receipt", photo_url: `${bid}/receipt.jpg` },
    ];
    const ok = safePhotoRows(bid, rows, ["post_front", "post_back", "post_left", "post_right"]);
    expect(ok.map((r) => r.photo_type)).toEqual(["post_front"]);
  });
});

import { runExtraCharge, type ExtraChargeDeps } from "./extra-charge.server";
import { allocateApplied } from "./deposit-review";

describe("Mehrkilometer separat (Karte)", () => {
  const mk = (claimResult: any, opts: { throwAmbiguous?: boolean } = {}) => {
    const calls: { key: string; amount: number }[] = [];
    const d: ExtraChargeDeps = {
      claim: async () => claimResult,
      getCard: async () => ({ customer: "cus", paymentMethod: "pm", environment: "sandbox" }),
      createIntent: async (_e, p, key) => {
        calls.push({ key, amount: p.amount });
        if (opts.throwAmbiguous) throw Object.assign(new Error("t"), { type: "StripeConnectionError" });
        return { id: "pi_x", status: "succeeded" };
      },
      record: async () => {},
    };
    return { d, calls };
  };
  it("mit Kaution verrechnet ⇒ 0 Stripe-Aufrufe", async () => {
    const h = mk({ result: "in_deposit_review" });
    await expect(runExtraCharge(h.d, "b1", 2250, "x")).rejects.toThrow(/Kautionsprüfung/);
    expect(h.calls).toHaveLength(0);
  });
  it("bereits erfolgreich / unklar alt ⇒ 0 Stripe-Aufrufe", async () => {
    for (const r of ["succeeded", "needs_review", "failed_final"]) {
      const h = mk({ result: r });
      await expect(runExtraCharge(h.d, "b1", 2250, "x")).rejects.toThrow();
      expect(h.calls).toHaveLength(0);
    }
  });
  it("Fortsetzung nach Timeout nutzt eingefrorenen Betrag und denselben Key", async () => {
    const h = mk({ result: "resume", amount_cents: 2250 });
    await runExtraCharge(h.d, "b1", 9999, "x");
    expect(h.calls).toEqual([{ key: "mt-extra-km-b1", amount: 2250 }]);
  });
  it("Verrechnung > Kaution: nur zugeordneter Teil gilt als verrechnet", () => {
    const items = priceItems([{ type: "damage", reason: "Delle", amount_cents: 19000 }, { type: "extra_km" }], facts({ extraKmChargeCents: 2250 }));
    const t = computeTotals(20000, items);
    expect(allocateApplied(items, t.appliedCents)).toEqual({ damage: 19000, extra_km: 1000 });
    expect(t.outstandingCents).toBe(1250);
  });
});

describe("Mietverlängerung und freier Rückzahlungsbetrag", () => {
  it("Mietverlängerung braucht Begründung und vereinbarten Betrag, kein automatischer Tarif", () => {
    expect(() => priceItems([{ type: "extension", amount_cents: 4900 }], facts())).toThrow(/Begründung/);
    expect(() => priceItems([{ type: "extension", reason: "1 Tag verlängert", amount_cents: 0 }], facts())).toThrow(/Betrag/);
    const it1 = priceItems([{ type: "extension", reason: "1 Tag verlängert", amount_cents: 4900 }], facts())[0];
    expect(it1.line_cents).toBe(4900);
    expect(it1.customer_text).toMatch(/vereinbarten Betrag/);
  });
  it("Rückzahlung gleich Vorschlag braucht keine Begründung", () => {
    const t = computeTotals(20000, priceItems([{ type: "smoking" }], facts()));
    expect(resolveRefund(t, 10000, null)).toEqual({ refundCents: 10000, appliedCents: 10000, reason: null });
    expect(resolveRefund(t, null, null).refundCents).toBe(10000);
  });
  it("abweichender Betrag braucht Begründung (Kulanz oder zusätzlicher Abzug)", () => {
    const t = computeTotals(20000, priceItems([{ type: "smoking" }], facts()));
    expect(() => resolveRefund(t, 15000, null)).toThrow(/begründen/);
    expect(() => resolveRefund(t, 15000, "ab")).toThrow(/begründen/);
    const r = resolveRefund(t, 15000, "Kulanz aus Kulanzgründen");
    expect(r).toEqual({ refundCents: 15000, appliedCents: 5000, reason: "Kulanz aus Kulanzgründen" });
  });
  it("lehnt negative, dezimale und über der Kaution liegende Beträge ab", () => {
    const t = computeTotals(20000, [], facts());
    for (const v of [-1, 1.5, 20001]) expect(() => resolveRefund(t, v, "Grund genug")).toThrow(/ungültig/);
  });
  it("draftKey erkennt geänderten Betrag, Begründung und Mailwahl", () => {
    const items = [{ type: "smoking" as const }];
    const a = draftKey(items, null, { refundCents: null, reason: null, sendMail: false });
    expect(draftKey(items, null, { refundCents: 15000, reason: "Kulanz", sendMail: false })).not.toBe(a);
    expect(draftKey(items, null, { refundCents: null, reason: null, sendMail: true })).not.toBe(a);
    expect(draftKey(items, null, { refundCents: null, reason: null, sendMail: false })).toBe(a);
  });
  it("Kundenmail zeigt die begründete Anpassung", () => {
    const items = priceItems([{ type: "extension", reason: "1 Tag verlängert", amount_cents: 4900 }], facts());
    const t = computeTotals(20000, items);
    const m = buildCustomerClosingMail({ to: "k@x.de", firstName: "Ali", vehicle: "V", startMs: 0, endMs: 1, totals: { ...t, appliedCents: 9900, refundCents: 10100 }, items, message: null, adjustment: "Kulanz: 50,00 € erlassen", payout: { kind: "preview" }, channel: "manual" });
    expect(m.text).toContain("Anpassung: Kulanz: 50,00 € erlassen");
    expect(m.text).toContain("Rückzahlung: 101,00 €");
    expect(m.text).toContain("1 Tag verlängert");
  });
});

describe("48h-Kautionserinnerung", () => {
  const end = Date.parse("2026-10-20T10:00:00Z");
  it("fällig exakt nach 48 Stunden, nicht bei 47:59", () => {
    const due = depositReminderDueAt(end, null);
    expect(due).toBe(end + 48 * 3600_000);
    expect(end + 47 * 3600_000 + 59 * 60_000 >= due).toBe(false);
    expect(end + 48 * 3600_000 >= due).toBe(true);
  });
  it("später gemeldete Rückgabe verschiebt die Erinnerung", () => {
    const ret = end + 26 * 3600_000;
    expect(depositReminderDueAt(end, ret)).toBe(ret + 48 * 3600_000);
  });
  it("frühere Rückgabe ändert das Mietende nicht", () => {
    expect(depositReminderDueAt(end, end - 3600_000)).toBe(end + 48 * 3600_000);
  });
  it("Kundenmail nur bei ausdrücklich eingeschalteter Mailwahl", () => {
    expect(shouldSendClosingMail(null)).toBe(false);
    expect(shouldSendClosingMail({ send_closing_mail: false })).toBe(false);
    expect(shouldSendClosingMail({ send_closing_mail: true })).toBe(true);
  });
});
