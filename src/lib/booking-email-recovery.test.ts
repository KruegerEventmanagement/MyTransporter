import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OutboxRow } from "@/lib/customer-mail-outbox";

const fake = vi.hoisted(() => ({ row: null as OutboxRow | null, sent: [] as unknown[], fail: false, terminal: "", record: true }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => ({
    upsert: async (r: OutboxRow) => {
      if (!fake.row) fake.row = { ...r, id: "row", status: "scheduled" };
      return { error: null };
    },
    select: () => {
      const q = { eq: () => q, single: async () => ({ data: fake.row, error: null }) };
      return q;
    },
  }),
} }));
vi.mock("@/lib/customer-mail-outbox.server", () => ({ createOutboxDeps: async () => ({
  precheck: async () => null, cancel: async () => {},
  claim: async () => fake.terminal ? { result: fake.terminal } : fake.row?.status === "sent" ? { result: "sent" } : { result: "claimed", lease_token: "lease", prior_ambiguous: false },
  loadAttachment: async () => null,
  send: async (mail: unknown, _att: unknown, key: string) => {
    fake.sent.push({ mail, key });
    return fake.fail ? { ok: false, kind: "invalid_key", status: 401, error: "invalid", ambiguous: false } : { ok: true, providerId: "provider-123" };
  },
  complete: async () => { if (fake.row && fake.record) fake.row.status = "sent"; return fake.record; },
  fail: async () => true,
}) }));

import { manualIntentSnapshot, sendDurableBookingMail } from "@/lib/booking-email-recovery.server";

beforeEach(() => { fake.row = null; fake.sent = []; fake.fail = false; fake.terminal = ""; fake.record = true; });
const mail = { from: "MyTransporter <info@mytransporter.org>", to: "test@example.invalid", reply_to: "info@mytransporter.org", subject: "Confirmation", html: "original", text: "original" };

describe("durable booking email transport (no external network)", () => {
  it.each(["cancelled", "blocked", "needs_review", "backoff", "in_progress"])("%s is never logged as provider acceptance", async (reason) => {
    fake.terminal = reason;
    expect(await sendDurableBookingMail("booking-3", "booking_confirmation", mail)).toEqual({ sent: false, reason });
    expect(fake.sent).toHaveLength(0);
  });
  it("acceptance without a durable completion remains open for same-key reconciliation", async () => {
    fake.record = false;
    expect(await sendDurableBookingMail("booking-4", "booking_confirmation", mail)).toEqual({ sent: false, reason: "accepted_unrecorded" });
    expect(fake.row?.status).toBe("scheduled");
  });
  it("a failed send retries the exact frozen payload and old provider key despite later edits", async () => {
    fake.fail = true;
    await expect(sendDurableBookingMail("booking-1", "booking_confirmation", mail)).rejects.toThrow("invalid_key");
    fake.fail = false;
    expect(await sendDurableBookingMail("booking-1", "booking_confirmation", { ...mail, html: "changed", to: "other@example.invalid" })).toEqual({ sent: true });
    expect(fake.sent).toEqual([{ mail, key: "booking-confirmation-booking-1" }, { mail, key: "booking-confirmation-booking-1" }]);
    await sendDurableBookingMail("booking-1", "booking_confirmation", mail);
    expect(fake.sent).toHaveLength(2);
  });
  it("admin has its own deduplication key and always receives its own payload", async () => {
    await sendDurableBookingMail("booking-2", "admin_booking", { ...mail, to: "info@mytransporter.org" });
    expect(fake.sent).toEqual([{ mail: { ...mail, to: "info@mytransporter.org" }, key: "admin-booking-booking-2" }]);
  });
  it("manual snapshot retains revision, requested intent and nullable legacy price without consulting later saves", () => {
    expect(manualIntentSnapshot({ id: "manual-1", revision: 3, customer_email: "test@example.invalid", start_at: "a", end_at: "b", confirmation_requested: true, total_price_cents: null })).toMatchObject({
      reservationId: "manual-1", revision: 3, confirmationRequested: true, totalPriceCents: null, customerEmail: "test@example.invalid",
    });
  });
});