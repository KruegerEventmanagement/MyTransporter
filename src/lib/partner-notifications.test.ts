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
  function db(user: any, inserted = true) {
    const upsert = vi.fn(() => ({ select: async () => ({ data: inserted ? [{ user_id: uid }] : [], error: null }) }));
    const from = (t: string) => {
      if (t === "partner_visits") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: visit, visited_at: new Date(Date.now() - 3600_000).toISOString(), partners: { id: "p", slug: "obi-leonberg", active: true, commission_rate_bp: 1000 } }, error: null }) }) }) };
      if (t === "partner_signups") return { upsert };
      return { select: () => ({ eq: () => ({ single: async () => ({ data: { name: "OBI Leonberg" } }) }) }), upsert: () => ({ select: async () => ({ data: [], error: null }) }) };
    };
    return { upsert, db: { from, rpc: async () => ({ data: [], error: null }), auth: { admin: { getUserById: async () => ({ data: { user } }) } } } };
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
});
