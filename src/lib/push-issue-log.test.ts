import { describe, expect, it } from "vitest";
import { isSilentAdminNotification, logPushIssueThrottled, PUSH_ISSUE_THROTTLE_MS } from "./push-issue-log";

function memoryStore() {
  const rows: { type: string; title: string; body: string; at: number }[] = [];
  let now = 0;
  return {
    rows,
    setNow: (t: number) => (now = t),
    store: {
      recentExists: async (title: string, sinceIso: string) =>
        rows.some((r) => r.title === title && r.at >= Date.parse(sinceIso)),
      insert: async (row: { type: string; title: string; body: string }) => {
        rows.push({ ...row, at: now });
      },
    },
  };
}

describe("Push-Fehlerprotokoll", () => {
  it("Push-Fehler lösen weder Push noch Pop-up aus", () => {
    expect(isSilentAdminNotification("push_failed")).toBe(true);
    expect(isSilentAdminNotification("booking_created")).toBe(false);
  });

  it("gleicher Push-Fehler wird innerhalb von 6 Stunden nur einmal notiert", async () => {
    const m = memoryStore();
    const t0 = Date.parse("2026-10-20T16:00:00Z");
    m.setNow(t0);
    expect(await logPushIssueThrottled(m.store, "vapid_missing", "x", new Date(t0))).toBe(true);
    for (let i = 1; i <= 100; i++) {
      await logPushIssueThrottled(m.store, "vapid_missing", "x", new Date(t0 + i * 1000));
    }
    expect(m.rows).toHaveLength(1);
    const later = t0 + PUSH_ISSUE_THROTTLE_MS + 1000;
    m.setNow(later);
    expect(await logPushIssueThrottled(m.store, "vapid_missing", "x", new Date(later))).toBe(true);
    expect(m.rows).toHaveLength(2);
  });
});
