import { describe, it, expect, vi } from "vitest";
import { runMailTest, MAIL_TEST_TO, MAIL_TEST_SUBJECT, type MailTestDeps } from "./mail-test.server";

const RID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
function deps(over: Partial<MailTestDeps> = {}) {
  const runs = new Map<string, { status: string; test_id: string; created_at: string; admin: string }>();
  const send = vi.fn().mockResolvedValue(true);
  const d: MailTestDeps = {
    isAdmin: async () => true,
    findByRequest: async (id) => runs.get(id) ?? null,
    lastRunAt: async (a) => [...runs.values()].filter((r) => r.admin === a).at(-1)?.created_at ?? null,
    insertRun: async (r) => {
      if (runs.has(r.request_id)) return "duplicate";
      runs.set(r.request_id, { status: "sending", test_id: r.test_id, created_at: new Date(1_000_000).toISOString(), admin: r.admin_id });
      return "ok";
    },
    setStatus: async (id, s) => {
      runs.get(id)!.status = s;
    },
    send,
    now: () => 1_000_000,
    randomId: () => "t1234567",
    ...over,
  };
  return { d, send, runs };
}

describe("Admin-Versandtest (simuliert, kein echter Versand)", () => {
  it("Kunde/anonym: verboten, kein Versand", async () => {
    const { d, send } = deps({ isAdmin: async () => false });
    expect(await runMailTest(d, "u", RID)).toEqual({ ok: false, reason: "Nicht berechtigt" });
    expect(send).not.toHaveBeenCalled();
  });
  it("Admin: fester Empfänger/Betreff, 'angenommen' statt 'zugestellt'", async () => {
    const { d, send } = deps();
    const r = await runMailTest(d, "admin", RID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.message).toMatch(/angenommen/);
    expect(send).toHaveBeenCalledWith(MAIL_TEST_TO, MAIL_TEST_SUBJECT, expect.stringContaining("t1234567"), `mail-test-${RID}`);
  });
  it("Fehlversand ist kein Erfolg", async () => {
    const { d } = deps({ send: vi.fn().mockResolvedValue(false) });
    const r = await runMailTest(d, "admin", RID);
    expect(r.ok).toBe(false);
  });
  it("gleiche Anfrage-ID: kein zweiter Versand; neue Anfrage innerhalb 1 Minute: abgelehnt", async () => {
    const { d, send } = deps();
    await runMailTest(d, "admin", RID);
    expect((await runMailTest(d, "admin", RID)).ok).toBe(true);
    const r = await runMailTest(d, "admin", "ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(r.ok).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
