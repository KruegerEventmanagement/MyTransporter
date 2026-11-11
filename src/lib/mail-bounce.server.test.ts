import { describe, expect, it, vi } from "vitest";
import { runBounceScan, BOUNCE_MAX_PAGES, type BounceStore, type BounceRow, type GmailResult } from "./mail-bounce.server";

const enc = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const NOW = Date.UTC(2026, 10, 7, 9);
const dsn = (id: string) => ({
  id, threadId: `t-${id}`, internalDate: String(NOW - 60_000),
  payload: { mimeType: "multipart/report", parts: [{ mimeType: "message/delivery-status", body: { data: enc(
    "Final-Recipient: rfc822; kunde@outlook.de\r\nAction: failed\r\nStatus: 5.7.1\r\nDiagnostic-Code: smtp; 550 5.7.1 Message lacks SPF/DKIM/DMARC Auth Records (AS9031519)") } }] },
});
const ok = (j: unknown): GmailResult => ({ ok: true, status: 200, json: async () => j });

function gmail(pages: string[][]) {
  const calls: string[] = [];
  const fn = async (p: string) => {
    calls.push(p);
    if (p.startsWith("/users/me/messages?")) {
      const i = Number(new URLSearchParams(p.split("?")[1]).get("pageToken") ?? 0);
      return ok({ messages: pages[i].map((id) => ({ id })), nextPageToken: i + 1 < pages.length ? String(i + 1) : undefined });
    }
    return ok(dsn(p.split("/")[4].split("?")[0]));
  };
  return { fn, calls };
}

function memStore(opts: { failDeliver?: number } = {}) {
  const rows = new Map<string, BounceRow & { dsn: string; due: boolean; nid: string | null }>();
  const notifications: string[] = [];
  let failDeliver = opts.failDeliver ?? 0;
  const store: BounceStore = {
    async knownIds(ids) { return new Set([...rows.values()].map((r) => r.dsn).filter((d) => ids.includes(d))); },
    async findOutbox() { return { id: "o1", kind: "reminder_30min", source_type: "booking", source_id: "b1" }; },
    async insertBounce(b, o, due) {
      if ([...rows.values()].some((r) => r.dsn === b.dsnId)) return "duplicate";
      rows.set(`r-${b.dsnId}`, { id: `r-${b.dsnId}`, dsn: b.dsnId, due, nid: null, outbox_id: o?.id ?? null, mail_kind: o?.kind ?? null,
        source_type: o?.source_type ?? null, source_id: o?.source_id ?? null, smtp_status: b.status, diagnostic: b.diagnostic });
      return "inserted";
    },
    async pendingAlerts() { return [...rows.values()].filter((r) => r.due && !r.nid); },
    async alertContext() { return { parts: ["PF-MY 1003 · Start"], bookingId: "b1" }; },
    async deliverAlert(id, title, body) {
      if (failDeliver > 0) { failDeliver--; throw new Error("db down"); }
      const r = rows.get(id)!; if (r.nid) return null;
      notifications.push(`${title}|${body}`); r.nid = `n${notifications.length}`; return r.nid;
    },
    markAlertError: vi.fn(async () => {}),
  };
  return { store, rows, notifications };
}

describe("Bounce-Scan: Pagination und retryfähige Alarmierung", () => {
  it("liest alle Seiten statt nur der ersten 25 Meldungen", async () => {
    const g = gmail([Array.from({ length: 100 }, (_, i) => `a${i}`), ["b0", "b1"]]);
    const m = memStore();
    const s = await runBounceScan(g.fn, m.store, NOW);
    expect(s.pages).toBe(2);
    expect(s.recorded).toBe(102);
    expect(g.calls[0]).toContain("newer_than%3A7d");
  });
  it("verliert keinen Alarm bei DB-Fehler und meldet beim nächsten Lauf genau einmal", async () => {
    const m = memStore({ failDeliver: 1 });
    const first = await runBounceScan(gmail([["x1"]]).fn, m.store, NOW);
    expect(first.alerted).toBe(0);
    expect(m.notifications).toHaveLength(0);
    expect(m.store.markAlertError).toHaveBeenCalledOnce();
    expect([...m.rows.values()][0].nid).toBeNull();
    const second = await runBounceScan(gmail([["x1"]]).fn, m.store, NOW);
    expect(second.recorded).toBe(0);
    expect(second.alerted).toBe(1);
    const third = await runBounceScan(gmail([["x1"]]).fn, m.store, NOW);
    expect(third.alerted).toBe(0);
    expect(m.notifications).toHaveLength(1);
    expect(m.notifications[0]).toContain("Schlüsselcode-Mail NICHT zugestellt");
    expect(m.notifications[0]).toContain("SPF/DMARC");
  });
  it("erfasst nicht lesbare DSN nicht, damit der nächste Lauf sie erneut holt", async () => {
    const m = memStore();
    const fn = async (p: string): Promise<GmailResult> =>
      p.startsWith("/users/me/messages?") ? ok({ messages: [{ id: "y1" }] }) : { ok: false, status: 503, json: async () => ({}) };
    const s = await runBounceScan(fn, m.store, NOW);
    expect(s.failed).toBe(1);
    expect(m.rows.size).toBe(0);
  });
  it("bricht bei unlesbarer Liste ab statt leere Ergebnisse zu melden", async () => {
    await expect(runBounceScan(async () => ({ ok: false, status: 401, json: async () => ({}) }), memStore().store, NOW)).rejects.toThrow("401");
  });
  it("alte Meldungen werden erfasst, aber nicht als Alarm gepusht", async () => {
    const m = memStore();
    const s = await runBounceScan(gmail([["old"]]).fn, m.store, NOW + 7 * 3600_000);
    expect(s.recorded).toBe(1);
    expect(m.notifications).toHaveLength(0);
  });
  it("begrenzt die Seitenzahl sichtbar", async () => {
    const g = gmail(Array.from({ length: BOUNCE_MAX_PAGES + 2 }, (_, i) => [`p${i}`]));
    const s = await runBounceScan(g.fn, memStore().store, NOW);
    expect(s.truncated).toBe(true);
  });
});
