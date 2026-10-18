import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { isAccountActiveForMail } from "@/lib/customer-mail-outbox.server";

const deps = (u: { exists: boolean; deleted: boolean }, completed = false) => ({
  getUser: async () => u, hasCompletedDeletion: async () => completed,
});

describe("Kontoprüfung für Rechnungsmails im Server", () => {
  it("normales Kundenkonto ist aktiv (früher fälschlich blockiert)", async () => {
    expect(await isAccountActiveForMail("u1", deps({ exists: true, deleted: false }))).toBe(true);
  });
  it("gelöschtes Konto ist nicht aktiv", async () => {
    expect(await isAccountActiveForMail("u1", deps({ exists: true, deleted: true }))).toBe(false);
  });
  it("abgeschlossene Kontolöschung ist nicht aktiv", async () => {
    expect(await isAccountActiveForMail("u1", deps({ exists: true, deleted: false }, true))).toBe(false);
  });
  it("fehlender Nutzer ist nicht aktiv", async () => {
    expect(await isAccountActiveForMail("u1", deps({ exists: false, deleted: false }))).toBe(false);
  });
  it("nicht prüfbar ⇒ Fehler statt aktiv", async () => {
    await expect(isAccountActiveForMail("u1", {
      getUser: async () => { throw new Error("down"); }, hasCompletedDeletion: async () => false,
    })).rejects.toThrow();
  });
});
