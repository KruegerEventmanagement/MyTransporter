import { describe, it, expect } from "vitest";
import { requestDepositSettlement, executeSettlement, type Deps, type SettlementRow, type BookingRow, type RefundLike } from "@/lib/deposit-settlement.server";
import { mirrorRefund, refundTotals, type MirrorDeps, type MirrorRow, type StripeRefundFull } from "@/lib/stripe-refund-sync.server";

const PI = "pi_test_1";
function setup(opts: { foreign?: RefundLike[] } = {}) {
  const booking: BookingRow = {
    id: "b1", user_id: "u1", status: "paid", start_date: "2026-10-17", start_hour: 9, start_km: 100,
    plan_price: 69, deposit: 200, deposit_status: "held", deposit_deducted_cents: 0, deposit_refund_id: null,
    stripe_payment_intent_id: PI, stripe_environment: "live", remarks: null, addons: [],
  };
  const rows: SettlementRow[] = [];
  const refunds: RefundLike[] = [...(opts.foreign ?? [])];
  const byKey = new Map<string, RefundLike>();
  let creates = 0;
  let failNextCreate: "timeout" | null = null;
  let n = 0;
  const inflight = (r: SettlementRow) => ["processing", "pending", "requires_action", "needs_review"].includes(r.status);
  const d: Deps = {
    now: () => Date.parse("2026-10-23T12:00:00Z"),
    newId: () => `00000000-0000-0000-0000-00000000000${++n}`,
    store: {
      async getBooking() { return { ...booking }; },
      async setBookingEnvironment() {},
      async updateBooking(_id, p) { Object.assign(booking, p); },
      async listSettlements() { return rows.map((r) => ({ ...r })); },
      async getSettlement(id) { return rows.find((r) => r.id === id) ?? null; },
      async findByRefundId(id) { return rows.find((r) => r.refund_id === id) ?? null; },
      async insertSettlement(row) {
        // Unique-Indizes nachbilden: request_key, one_per_kind, one_inflight
        if (rows.some((r) => r.request_key && r.request_key === row.request_key)) return null;
        if (rows.some((r) => r.kind === row.kind && r.status !== "failed" && r.status !== "canceled")) return null;
        if (inflight(row as SettlementRow) && rows.some(inflight)) return null;
        const full = { refund_status: null, failure_reason: null, requested_at: "", stripe_called_at: null, confirmed_at: null, last_synced_at: null, ...row } as SettlementRow;
        rows.push(full);
        return { ...full };
      },
      async updateSettlement(id, p) { const r = rows.find((x) => x.id === id)!; Object.assign(r, p); return { ...r }; },
      async markStripeCalled(id, at) { const r = rows.find((x) => x.id === id)!; r.stripe_called_at ??= at; return { ...r }; },
      async listOpen() { return rows.filter(inflight); },
      async notifyAdmin() {},
    },
    stripe: {
      async createRefund(_env, p, key) {
        let r = byKey.get(key);
        if (!r) {
          creates++;
          r = { id: `re_${creates}`, status: "succeeded", amount: p.amount, payment_intent: p.payment_intent, metadata: p.metadata };
          byKey.set(key, r);
          refunds.push(r);
        }
        if (failNextCreate === "timeout") { failNextCreate = null; throw new Error("ETIMEDOUT"); }
        return r;
      },
      async retrieveRefund(_e, id) { return refunds.find((r) => r.id === id) ?? null; },
      async listRefunds() { return refunds.map((r) => ({ ...r })); },
      async retrievePaymentIntent() { return { id: PI, amount_received: 26900, status: "succeeded", currency: "eur" }; },
    },
  };
  return { d, booking, rows, refunds, creates: () => creates, timeoutNext: () => { failNextCreate = "timeout"; } };
}

describe("Kautionsrückzahlung – Schutz gegen Doppelauszahlung", () => {
  it("zahlt bei 269 € (69 Miete + 200 Kaution) höchstens 200 € zurück", async () => {
    const t = setup();
    const { settlement } = await requestDepositSettlement(t.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k1" });
    expect(settlement.refund_cents).toBe(20000);
    expect(t.refunds.reduce((s, r) => s + r.amount, 0)).toBe(20000);
  });

  it("Doppelklick/parallele Anfragen erzeugen genau eine Stripe-Erstattung", async () => {
    const t = setup();
    await Promise.allSettled([
      requestDepositSettlement(t.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k1" }),
      requestDepositSettlement(t.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k1" }),
      requestDepositSettlement(t.d, { bookingId: "b1", deductCents: 5000, adminId: "a", requestKey: "k2" }),
    ]);
    expect(t.creates()).toBe(1);
    expect(t.refunds).toHaveLength(1);
  });

  it("Timeout nach Stripe-Annahme: Retry nutzt denselben Auftrag und Key, keine zweite Erstattung", async () => {
    const t = setup();
    t.timeoutNext();
    const first = await requestDepositSettlement(t.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k1" });
    expect(first.settlement.status).toBe("processing");
    const again = await requestDepositSettlement(t.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k1" });
    expect(again.settlement.status).toBe("succeeded");
    expect(t.creates()).toBe(1);
    expect(t.rows).toHaveLength(1);
  });

  it("direkt im Stripe-Dashboard erstattete 200 € sperren die Kautionsrückzahlung", async () => {
    const t = setup({ foreign: [{ id: "re_dash", status: "succeeded", amount: 20000, payment_intent: PI, metadata: {} }] });
    await expect(requestDepositSettlement(t.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k1" })).rejects.toThrow(/bereits Erstattungen über 200\.00/);
    expect(t.creates()).toBe(0);
    expect(t.rows).toHaveLength(0);
  });

  it("auch eine noch ausstehende (pending) Erstattung sperrt", async () => {
    const t = setup({ foreign: [{ id: "re_p", status: "pending", amount: 5000, payment_intent: PI, metadata: {} }] });
    await expect(requestDepositSettlement(t.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k1" })).rejects.toThrow();
    expect(t.creates()).toBe(0);
  });

  it("eine gescheiterte Erstattung sperrt nicht", async () => {
    const t = setup({ foreign: [{ id: "re_f", status: "failed", amount: 20000, payment_intent: PI, metadata: {} }] });
    const { settlement } = await requestDepositSettlement(t.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k1" });
    expect(settlement.status).toBe("succeeded");
    expect(t.creates()).toBe(1);
  });

  it("Stripe nicht erreichbar ⇒ kein Auftrag, keine Erstattung (fail closed)", async () => {
    const t = setup();
    t.d.stripe.listRefunds = async () => { throw new Error("gateway down"); };
    await expect(requestDepositSettlement(t.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k1" })).rejects.toThrow("gateway down");
    expect(t.creates()).toBe(0);
  });

  it("Webhook-/Cron-Abgleich (mayCreate=false) erzeugt nie eine Erstattung", async () => {
    const t = setup();
    t.d.stripe.listRefunds = async () => { throw new Error("x"); };
    await requestDepositSettlement(t.d, { bookingId: "b1", deductCents: 0, adminId: "a", requestKey: "k1" }).catch(() => undefined);
    t.d.stripe.listRefunds = async () => [];
    for (const r of t.rows) await executeSettlement(t.d, r, { mayCreate: false });
    expect(t.creates()).toBe(0);
  });
});

function mirror() {
  const db = new Map<string, MirrorRow & { notified?: boolean }>();
  const rank = (s: string) => (s === "failed" || s === "canceled" ? 3 : s === "succeeded" ? 2 : 1);
  let notes = 0;
  const d: MirrorDeps = {
    async retrieveRefund() { return null; },
    async listRefundsForPi() { return []; },
    async listRecentRefunds() { return []; },
    async findBookingByPi() { return { id: "b1" }; },
    async getSettlementKind(id) { return id === "s1" ? { id: "s1", kind: "deposit", booking_id: "b1" } : null; },
    async upsert(row) {
      const old = db.get(row.refund_id);
      if (!old) { db.set(row.refund_id, { ...row }); return { inserted: true, status: row.status, notify: row.origin === "external" }; }
      if (rank(row.status) >= rank(old.status)) old.status = row.status;
      return { inserted: false, status: old.status, notify: old.origin === "external" && !old.notified };
    },
    async markNotified(id) { db.get(id)!.notified = true; },
    async notifyAdmin() { notes++; },
    settlement: null,
  };
  return { d, db, notes: () => notes };
}
const ref = (p: Partial<StripeRefundFull>): StripeRefundFull => ({ id: "re_x", status: "pending", amount: 20000, currency: "eur", payment_intent: PI, charge: "ch_1", failure_reason: null, reason: null, created: 1, metadata: {}, ...p });

describe("Stripe-Refund-Spiegel (Webhook/Abgleich)", () => {
  it("Dashboard-Refund wird nie als Kaution zugeordnet und meldet Admin genau einmal", async () => {
    const m = mirror();
    await mirrorRefund(m.d, "live", ref({ status: "pending" }));
    await mirrorRefund(m.d, "live", ref({ status: "succeeded" }));
    await mirrorRefund(m.d, "live", ref({ status: "succeeded" })); // doppeltes Event
    expect(m.db.get("re_x")!.allocation).toBe("unallocated");
    expect(m.notes()).toBe(1);
  });

  it("außer der Reihe: späteres pending stuft succeeded nicht zurück, failed gewinnt", async () => {
    const m = mirror();
    await mirrorRefund(m.d, "live", ref({ status: "succeeded" }));
    await mirrorRefund(m.d, "live", ref({ status: "pending" }));
    expect(m.db.get("re_x")!.status).toBe("succeeded");
    await mirrorRefund(m.d, "live", ref({ status: "failed" }));
    expect(m.db.get("re_x")!.status).toBe("failed");
  });

  it("App-Refund mit settlement_id wird als Kaution zugeordnet; fremde settlement_id nicht", async () => {
    const m = mirror();
    await mirrorRefund(m.d, "live", ref({ id: "re_app", metadata: { settlement_id: "s1" } }));
    await mirrorRefund(m.d, "live", ref({ id: "re_fake", metadata: { settlement_id: "unknown" } }));
    expect(m.db.get("re_app")!.allocation).toBe("deposit");
    expect(m.db.get("re_fake")!.origin).toBe("external");
  });

  it("Summen zählen jede Erstattung genau einmal", () => {
    const t = refundTotals([
      { status: "succeeded", amount_cents: 20000, origin: "app_settlement" },
      { status: "pending", amount_cents: 1000, origin: "external" },
      { status: "failed", amount_cents: 500, origin: "external" },
    ]);
    expect(t).toEqual({ succeededCents: 20000, pendingCents: 1000, failedCents: 500, externalActiveCents: 1000 });
  });
});
