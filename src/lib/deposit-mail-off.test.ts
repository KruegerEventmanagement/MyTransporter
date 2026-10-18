// Kundenmail AUS: kein Weg (ensureClosingMail, Vorversand-Precheck) darf eine Mail erzeugen.
import { describe, expect, it, vi } from "vitest";

const insertRow = vi.fn();
const processRow = vi.fn();

function chain(data: unknown) {
  const q: Record<string, unknown> = {};
  const self = () => q;
  for (const m of ["select", "eq", "in", "ilike", "limit", "order", "gte", "lte", "is"]) q[m] = self;
  q.maybeSingle = async () => ({ data, error: null });
  q.single = async () => ({ data, error: null });
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return q;
}

const review = {
  id: "r1", source_type: "manual", source_id: "33333333-2222-3333-4444-555555555555", status: "finalized", revision: 2,
  items: [], customer_message: null, manual_deposit_cents: 20000, manual_deposit_method: "cash",
  final_deposit_cents: 20000, final_deduct_total_cents: 0, final_deduct_applied_cents: 0,
  final_outstanding_cents: 0, final_refund_cents: 20000, settlement_id: null,
  finalized_at: new Date().toISOString(), manual_payout_status: "confirmed", manual_payout_method: "cash", manual_payout_confirmed_at: null,
  refund_override_cents: null, adjustment_reason: null, send_closing_mail: false,
};
const reservation = { id: review.source_id, customer_name: "Max Mustermann", customer_email: "max@example.com", vehicle_name: "Fiat", vehicle_plate: "LEO 1", start_at: "2026-10-18T08:00:00Z", end_at: "2026-10-19T08:00:00Z", total_price_cents: 9900 };

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (t: string) =>
      t === "deposit_reviews" ? chain(review) : t === "manual_reservations" ? chain(reservation) : chain(null),
  },
}));
vi.mock("@/lib/customer-mail-outbox.server", () => ({
  insertRow: (...a: unknown[]) => insertRow(...a),
  processOutboxRowById: (...a: unknown[]) => processRow(...a),
}));

const { ensureClosingMail, depositMailPrecheck } = await import("@/lib/deposit-review.server");

describe("Kundenmail ausgeschaltet: kein Versandweg erzeugt eine Mail", () => {
  it("ensureClosingMail bricht ab, ohne die Outbox zu berühren", async () => {
    expect(await ensureClosingMail("manual", review.source_id)).toBe("disabled");
    expect(insertRow).not.toHaveBeenCalled();
    expect(processRow).not.toHaveBeenCalled();
  });
  it("Vorversand-Prüfung stoppt eine dennoch existierende Outbox-Zeile", async () => {
    const stop = await depositMailPrecheck({
      id: "o1", source_type: "manual", source_id: review.source_id, kind: "deposit_closing",
      recipient_email: "max@example.com", payload: { text: "Rückzahlung: 200,00 €" },
    } as never);
    expect(stop).toMatch(/ausgeschaltet/);
    expect(insertRow).not.toHaveBeenCalled();
  });
});
