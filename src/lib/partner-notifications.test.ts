import { describe, expect, it, vi } from "vitest";
import { buildPartnerNotification, PARTNER_NOTIFY_RECIPIENT, partnerEventKey } from "@/lib/partner-notifications";
import { processPartnerNotifications, claimPartnerSignup, type NotifyRow } from "@/lib/partner-notifications.server";
import { handlePartnerScan } from "@/lib/partner-scan";

const payload = { partnerName: "OBI Leonberg", slug: "obi-leonberg", occurredAt: "2026-07-01T10:00:00Z", ref: "Aufruf x" };
const row = (o: Partial<NotifyRow> = {}): NotifyRow => ({ id: "n1", kind: "scan", event_key: "scan:v1", payload, attempts: 1, lease_token: "t", ...o });

function deps(sendResult: any, rows = [row()]) {
  const finish = vi.fn(async (..._a: unknown[]) => true);
  const send = vi.fn(async () => sendResult);
  return { finish, send, d: { claim: async () => rows, finish, send, render: () => "<p>x</p>" } };
}

describe("partner notifications", () => {
  it("names partner, slug link and Berlin time; test mail is marked TEST", () => {
    const m = buildPartnerNotification("scan", payload);
    expect(m.subject).toContain("OBI Leonberg");
    expect(m.rows.find((r) => r.label === "Trackinglink")?.value).toBe("https://mytransporter.org/q/obi-leonberg");
    expect(m.rows.find((r) => r.label === "Zeit")?.value).toBe("01.07.2026, 12:00:00 (Europe/Berlin)");
    expect(buildPartnerNotification("test", payload).subject.startsWith("[TEST] ")).toBe(true);
  });
  it("paid booking mail states rent without deposit and commission", () => {
    const m = buildPartnerNotification("booking_paid", { ...payload, bookingReference: "ABC", status: "paid", rentCents: 19900, commissionCents: 1990, ratePercent: 10 });
    expect(m.rows.find((r) => r.label === "Zahlungsstatus")?.value).toBe("bezahlt");
    expect(m.rows.find((r) => r.label === "Provision (10 %)")?.value).toContain("19,90");
  });
  it("sends only to info@ with a stable per-event idempotency key", async () => {
    const { d, send, finish } = deps({ ok: true, providerId: "abc12345" });
    await processPartnerNotifications(d as any);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: PARTNER_NOTIFY_RECIPIENT, idempotencyKey: "partner-notify-scan:v1" }));
    expect(finish).toHaveBeenCalledWith("n1", "t", "sent", "abc12345", null, 0);
    expect(PARTNER_NOTIFY_RECIPIENT).toBe("info@mytransporter.org");
  });
  it("transient failure stays retryable; ambiguous result is never resent", async () => {
    const a = deps({ ok: false, kind: "transient", ambiguous: false, status: 503, error: "x" });
    await processPartnerNotifications(a.d as any);
    expect(a.finish.mock.calls[0]![2]).toBe("failed");
    const b = deps({ ok: false, kind: "network", ambiguous: true, status: null, error: "x" });
    await processPartnerNotifications(b.d as any);
    expect(b.finish.mock.calls[0]![2]).toBe("needs_review");
  });
  it("event keys dedupe webhook retries", () => {
    expect(partnerEventKey("booking_paid", "b1")).toBe(partnerEventKey("booking_paid", "b1"));
  });
  it("scan redirect still 302s when the mail enqueue fails", async () => {
    const res = await handlePartnerScan("obi-leonberg", {
      lookup: async () => ({ id: "p", target_path: "/" }),
      recordVisit: async () => "11111111-1111-4111-8111-111111111111",
      afterVisit: async () => { throw new Error("db down"); },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/?mt_ref=11111111-1111-4111-8111-111111111111");
  });
});

describe("signup attribution", () => {
  const visit = "22222222-2222-4222-8222-222222222222";
  const uid = "33333333-3333-4333-8333-333333333333";
  const visitedAt = new Date(Date.now() - 3600_000).toISOString();
  function db(user: any, inserted = true, existingVisit: string | null = visit, outboxFails = false) {
    const upsert = vi.fn(() => ({ select: async () => ({ data: inserted ? [{ user_id: uid }] : [], error: null }) }));
    const outbox = vi.fn((_row: any) => ({ select: async () => (outboxFails ? { data: null, error: { message: "down" } } : { data: [], error: null }) }));
    const from = (t: string) => {
      if (t === "partner_visits") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: visit, visited_at: visitedAt, partners: { id: "p", slug: "obi-leonberg", active: true, commission_rate_bp: 1000 } }, error: null }) }) }) };
      if (t === "partner_signups") return { upsert, select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingVisit ? { visit_id: existingVisit, partner_id: "p" } : null }) }) }) };
      if (t === "partner_notifications") return { upsert: outbox };
      return { select: () => ({ eq: () => ({ single: async () => ({ data: { name: "OBI Leonberg" } }) }) }) };
    };
    return { upsert, outbox, db: { from, rpc: async () => ({ data: [], error: null }), auth: { admin: { getUserById: async () => ({ data: { user } }) } } } };
  }
  it("existing customer who logs in after the scan is not counted", async () => {
    const { db: d, upsert } = db({ created_at: new Date(Date.now() - 30 * 86400_000).toISOString(), email_confirmed_at: "x" });
    expect(await claimPartnerSignup(d as any, uid, visit)).toBe("skipped");
    expect(upsert).not.toHaveBeenCalled();
  });
  it("unconfirmed account is not counted", async () => {
    const { db: d } = db({ created_at: new Date().toISOString(), email_confirmed_at: null });
    expect(await claimPartnerSignup(d as any, uid, visit)).toBe("skipped");
  });
  it("new confirmed account after scan is attributed once", async () => {
    const u = { created_at: new Date().toISOString(), email_confirmed_at: "x" };
    expect(await claimPartnerSignup(db(u).db as any, uid, visit)).toBe("attached");
    expect(await claimPartnerSignup(db(u, false).db as any, uid, visit)).toBe("exists");
  });
  it("account created minutes before the scan is never counted (strict server order)", async () => {
    const { db: d, upsert } = db({ created_at: new Date(Date.parse(visitedAt) - 60_000).toISOString(), email_confirmed_at: "x" });
    expect(await claimPartnerSignup(d as any, uid, visit)).toBe("skipped");
    const same = db({ created_at: visitedAt, email_confirmed_at: "x" });
    expect(await claimPartnerSignup(same.db as any, uid, visit)).toBe("skipped");
    expect(upsert).not.toHaveBeenCalled();
  });
  it("outbox failure surfaces so the client retries; retry backfills the missing outbox row", async () => {
    const u = { created_at: new Date().toISOString(), email_confirmed_at: "x" };
    await expect(claimPartnerSignup(db(u, true, visit, true).db as any, uid, visit)).rejects.toThrow();
    const again = db(u, false);
    expect(await claimPartnerSignup(again.db as any, uid, visit)).toBe("exists");
    expect(again.outbox).toHaveBeenCalledTimes(1);
    expect(again.outbox.mock.calls[0]?.[0]).toMatchObject({ event_key: expect.stringContaining(uid), kind: "signup" });
  });
  it("existing signup from another visit does not create a mail", async () => {
    const u = { created_at: new Date().toISOString(), email_confirmed_at: "x" };
    const other = db(u, false, "44444444-4444-4444-8444-444444444444");
    expect(await claimPartnerSignup(other.db as any, uid, visit)).toBe("exists");
    expect(other.outbox).not.toHaveBeenCalled();
  });
});

describe("paid booking mail uses real refunds", () => {
  it("late retry reports base after existing rent refunds", async () => {
    const { notifyPaidPartnerBooking } = await import("@/lib/partner-notifications.server");
    const outbox = vi.fn((_row: any) => ({ select: async () => ({ data: [], error: null }) }));
    const from = (t: string): any => {
      if (t === "booking_partner_attributions") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { partner_id: "p", partner_slug: "obi-leonberg", commission_rate_bp: 1000, visit_id: "v" } }) }) }) };
      if (t === "bookings") return { select: () => ({ eq: () => ({ single: async () => ({ data: { pickup_code: "MT1", status: "paid", plan_price: 100, addons_total_cents: 0 } }) }) }) };
      if (t === "stripe_refunds") return { select: () => ({ eq: () => ({ order: async () => ({ data: [{ refund_id: "re_1", amount_cents: 2000, status: "succeeded", allocation: "cancellation" }, { refund_id: "re_d", amount_cents: 5000, status: "succeeded", allocation: "deposit" }], error: null }) }) }) };
      if (t === "partner_notifications") return { upsert: outbox };
      return { select: () => ({ eq: () => ({ single: async () => ({ data: { name: "OBI Leonberg" } }) }) }) };
    };
    await notifyPaidPartnerBooking({ from } as any, "b1");
    expect(outbox.mock.calls[0]?.[0].payload).toMatchObject({ rentCents: 10000, refundedCents: 2000, baseCents: 8000, commissionCents: 800 });
  });
});
