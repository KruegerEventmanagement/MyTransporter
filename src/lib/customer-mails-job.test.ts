import { describe, it, expect, vi } from "vitest";
import { runCustomerMailsJob } from "./customer-mails-job";

describe("process-customer-mails Job", () => {
  it("Sweep-Fehler: Bounce-Scan läuft trotzdem, Status 500 meldet Fehler", async () => {
    const scan = vi.fn(async () => ({ scanned: 2 }));
    const r = await runCustomerMailsJob({ sweep: async () => { throw new Error("db down"); }, scan, log: () => {} });
    expect(scan).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ ok: false, sweep: { error: true }, bounces: { scanned: 2 } });
  });
  it("Scan-Fehler stoppt Sweep-Ergebnis nicht, Format bleibt", async () => {
    const r = await runCustomerMailsJob({ sweep: async () => ({ sent: 1 }), scan: async () => { throw new Error("x"); }, log: () => {} });
    expect(r).toEqual({ status: 200, body: { ok: true, sent: 1, bounces: { error: true } } });
  });
});
