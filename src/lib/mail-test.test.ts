import { describe, it, expect, vi } from "vitest";
import { runMailTest, MAIL_TEST_TO, MAIL_TEST_SUBJECT, type MailTestDeps, type MailTestClaim } from "./mail-test.server";

const RID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const RID2 = "ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** Simuliert die DB-Funktion claim_mail_test inkl. Sperre pro Admin (serialisierte Promise-Kette). */
function deps(over: Partial<MailTestDeps> = {}) {
  const runs = new Map<string, { status: string; test_id: string; created_at: string; admin: string }>();
  const locks = new Map<string, Promise<unknown>>();
  const send = vi.fn().mockResolvedValue(true);
  const d: MailTestDeps = {
    isAdmin: async () => true,
    claim: (r) => {
      const prev = locks.get(r.admin_id) ?? Promise.resolve();
      const next = prev.then(async (): Promise<MailTestClaim> => {
        await new Promise((res) => setTimeout(res, 5));
        const ex = runs.get(r.request_id);
        if (ex) return { state: "duplicate", status: ex.status, test_id: ex.test_id, created_at: ex.created_at };
        if ([...runs.values()].some((x) => x.admin === r.admin_id)) return { state: "rate_limited" };
        runs.set(r.request_id, { status: "sending", test_id: r.test_id, created_at: new Date(1_000_000).toISOString(), admin: r.admin_id });
        return { state: "claimed" };
      });
      locks.set(r.admin_id, next.catch(() => {}));
      return next;
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
    expect((await runMailTest(d, "admin", RID)).ok).toBe(false);
  });
  it("2 parallele Requests mit unterschiedlichen IDs: genau ein Versand", async () => {
    const { d, send } = deps();
    const [a, b] = await Promise.all([runMailTest(d, "admin", RID), runMailTest(d, "admin", RID2)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("parallel gleiche ID: kein zweiter Versand", async () => {
    const { d, send } = deps();
    await Promise.all([runMailTest(d, "admin", RID), runMailTest(d, "admin", RID)]);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("DB-Fehler beim Claim: kein Versand, kein Erfolg", async () => {
    const { d, send } = deps({ claim: async () => { throw new Error("db down"); } });
    expect((await runMailTest(d, "admin", RID)).ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it("Status-Update-Fehler nach Fehlversand: trotzdem kein Erfolg", async () => {
    const { d } = deps({ send: vi.fn().mockResolvedValue(false), setStatus: async () => { throw new Error("x"); } });
    expect((await runMailTest(d, "admin", RID)).ok).toBe(false);
  });
});
