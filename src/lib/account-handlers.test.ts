import { describe, expect, it, vi } from "vitest";
import { handleDeleteMyAccount, type DeleteDeps } from "./account-handlers.server";
import { assertActiveAccount } from "./active-account";
import { createPrivacyStore } from "./privacy-store.server";
import { hookAuthorized } from "@/routes/api/public/hooks/purge-document-archive";
import type { PrivacyStore } from "./privacy-ops.server";

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ middleware: () => ({ server: () => ({}) }) }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => () => ({}) }));

const NOW = Date.parse("2026-10-06T12:00:00Z");
const nowSec = NOW / 1000;

function deps(over: Partial<DeleteDeps> = {}, storeOver: Partial<PrivacyStore> = {}) {
  const run = vi.fn();
  const store = {
    deletionStatus: async () => null,
    listBookings: async () => [],
    isAdminUser: async () => false,
    claimDeletion: async () => {
      run();
      return { state: "busy" };
    },
    ...storeOver,
  } as unknown as PrivacyStore;
  const d: DeleteDeps = {
    uid: "u1",
    claims: { amr: [{ method: "password", timestamp: nowSec - 30 }] },
    password: "",
    nowMs: NOW,
    store,
    getAuthUser: async () => ({ email: "a@b.de", created_at: "2026-01-01T00:00:00Z" }),
    isAdmin: async () => false,
    verifyPassword: async () => false,
    ...over,
  };
  return { d, run };
}

describe("Kontolöschung – Handler (simuliert)", () => {
  it("Rollenprüfung schlägt fehl: fail closed, nichts gestartet", async () => {
    const { d, run } = deps({ isAdmin: async () => Promise.reject(new Error("db")) });
    const r = await handleDeleteMyAccount(d);
    expect(r.ok).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
  it("Admin wird nie gelöscht", async () => {
    const { d, run } = deps({ isAdmin: async () => true });
    expect((await handleDeleteMyAccount(d)).ok).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
  it("veraltete/künftige Anmeldung ohne Passwort: Passwort nötig", async () => {
    for (const ts of [nowSec - 3600, nowSec + 3600]) {
      const { d, run } = deps({ claims: { amr: [{ method: "password", timestamp: ts }] } });
      const r = await handleDeleteMyAccount(d);
      expect(r).toMatchObject({ ok: false, needsPassword: true });
      expect(run).not.toHaveBeenCalled();
    }
  });
  it("falsches Passwort: abgelehnt", async () => {
    const { d, run } = deps({ password: "x", claims: {} });
    expect(await handleDeleteMyAccount(d)).toMatchObject({ ok: false, needsPassword: true });
    expect(run).not.toHaveBeenCalled();
  });
  it("Auth-Konto schon gelöscht, Antrag offen: ehrlicher Hinweis auf automatische Fortsetzung", async () => {
    const { d } = deps(
      { getAuthUser: async () => null },
      { deletionStatus: async () => ({ status: "failed", requested_at: "x", completed_at: null }) },
    );
    const r = await handleDeleteMyAccount(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/automatisch/);
  });
  it("bestätigt: Löschung startet", async () => {
    const { d, run } = deps();
    await handleDeleteMyAccount(d);
    expect(run).toHaveBeenCalled();
  });
});

describe("Aktives Konto (alter JWT)", () => {
  it("inaktiv, Fehler oder Ausnahme: 401", async () => {
    for (const rpc of [
      async () => ({ data: false, error: null }),
      async () => ({ data: null, error: { message: "x" } }),
      async () => Promise.reject(new Error("netz")),
    ]) {
      await expect(assertActiveAccount({ rpc } as never, "u1")).rejects.toBeInstanceOf(Response);
    }
    await expect(assertActiveAccount({ rpc: async () => ({ data: true, error: null }) } as never, "u1")).resolves.toBeUndefined();
  });
});

describe("Datenschutz-Job Zugriff", () => {
  const req = (h?: string, url = "https://x/api") => new Request(url, { method: "POST", headers: h ? { "x-hook-token": h } : {} });
  it("nur Header-Token, kein URL-Token, kein leerer Token", () => {
    expect(hookAuthorized(req("geheim"), "geheim")).toBe(true);
    expect(hookAuthorized(req(undefined, "https://x/api?token=geheim"), "geheim")).toBe(false);
    expect(hookAuthorized(req("falsch"), "geheim")).toBe(false);
    expect(hookAuthorized(req(""), undefined)).toBe(false);
  });
});

/** Minimale PostgREST-Kette, die Aufrufe protokolliert. */
function fakeDb(responses: Array<{ data?: unknown; error?: unknown }>) {
  const calls: Array<{ op: string; payload?: unknown }> = [];
  const chain = (op: string, payload?: unknown) => {
    calls.push({ op, payload });
    const c: Record<string, unknown> = {};
    for (const m of ["eq", "is", "in", "select", "order", "limit", "or", "lt"]) c[m] = () => c;
    c.maybeSingle = async () => responses.shift() ?? { data: null, error: null };
    c.then = (res: (v: unknown) => void) => res(responses.shift() ?? { data: [], error: null });
    return c;
  };
  return {
    calls,
    db: { from: () => ({ select: () => chain("select"), update: (p: unknown) => chain("update", p), insert: (p: unknown) => chain("insert", p) }) },
  };
}

describe("PrivacyStore-Adapter (simulierte DB)", () => {
  it("markRemoved: beide Zeitstempel in EINEM Update, Fehler wird nicht verschluckt", async () => {
    const { db, calls } = fakeDb([
      { data: { deleted_by_user_at: null, removed_from_account_at: null }, error: null },
      { data: null, error: { code: "500", message: "simuliert" } },
    ]);
    const store = await createPrivacyStore(db);
    await expect(store.markRemoved("d1", "u1")).rejects.toThrow(/simuliert/);
    const updates = calls.filter((c) => c.op === "update");
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0]!.payload as object).sort()).toEqual(["deleted_by_user_at", "removed_from_account_at"]);
  });
  it("markRemoved erhält früheren Löschzeitpunkt", async () => {
    const { db, calls } = fakeDb([
      { data: { deleted_by_user_at: "2026-01-01T00:00:00Z", removed_from_account_at: null }, error: null },
      { data: [{ id: "d1" }], error: null },
    ]);
    await (await createPrivacyStore(db)).markRemoved("d1", "u1");
    expect((calls.find((c) => c.op === "update")!.payload as { deleted_by_user_at: string }).deleted_by_user_at).toBe("2026-01-01T00:00:00Z");
  });
  it("insertArchive: echter Fehler wirft, Duplikat nicht", async () => {
    const a = fakeDb([{ error: { code: "42501", message: "denied" } }]);
    await expect((await createPrivacyStore(a.db)).insertArchive({} as never)).rejects.toThrow(/denied/);
    const b = fakeDb([{ error: { code: "23505", message: "dup" } }]);
    await expect((await createPrivacyStore(b.db)).insertArchive({} as never)).resolves.toBeUndefined();
  });
});
