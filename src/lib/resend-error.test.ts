import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const inserts: Array<Record<string, unknown>> = [];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push(row);
        return { error: null };
      },
    }),
  },
}));
vi.mock("@/lib/push.functions", () => ({ pushToAdmins: async () => ({}) }));

import { classifyResendError, sendEmail, redactSecrets } from "@/lib/booking-emails.server";

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  inserts.length = 0;
  vi.stubEnv("RESEND_API_KEY", "re_testtesttest123456");
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  errorSpy.mockRestore();
});

describe("classifyResendError", () => {
  it("401 validation_error 'API key is invalid' → Schlüssel ungültig", () => {
    const r = classifyResendError(401, JSON.stringify({ statusCode: 401, name: "validation_error", message: "API key is invalid" }));
    expect(r.kind).toBe("invalid_key");
  });
  it("restricted_api_key → fehlende Berechtigung, kein Ungültig-Hinweis", () => {
    const r = classifyResendError(401, JSON.stringify({ name: "restricted_api_key", message: "This API key is restricted to only send emails" }));
    expect(r.kind).toBe("restricted_key");
    expect(r.hint).not.toMatch(/ungültig/);
  });
  it("403 unverified domain → Absender/Domain, kein Schlüsselwechsel", () => {
    const r = classifyResendError(403, JSON.stringify({ name: "validation_error", message: "The mytransporter.org domain is not verified." }));
    expect(r.kind).toBe("sender_domain");
    expect(r.hint).not.toMatch(/ersetzen/);
  });
  it("403 testing-sender restriction → Absender/Domain", () => {
    const r = classifyResendError(403, JSON.stringify({ name: "validation_error", message: "You can only send testing emails to your own email address" }));
    expect(r.kind).toBe("sender_domain");
  });
  it("nicht jede 401/403 ist ein ungültiger Schlüssel", () => {
    expect(classifyResendError(403, JSON.stringify({ name: "x", message: "forbidden" })).kind).toBe("other");
    expect(classifyResendError(401, "nope").kind).toBe("other");
  });
  it("429/5xx → vorübergehend", () => {
    expect(classifyResendError(429, JSON.stringify({ name: "rate_limit_exceeded", message: "Too many" })).kind).toBe("transient");
    expect(classifyResendError(503, "down").kind).toBe("transient");
  });
  it("redactSecrets entfernt Schlüssel", () => {
    expect(redactSecrets("key re_abcdefgh12345 Bearer re_x")).not.toMatch(/abcdefgh/);
  });
});

describe("sendEmail (simulierte Resend-Antworten) Wahrheit gesendet/nicht gesendet", () => {
  it("simulierter 401 validation_error invalid key → false + Hinweis, kein Secret im Log", async () => {
    vi.stubGlobal("fetch", respond(401, { statusCode: 401, name: "validation_error", message: "API key is invalid" }));
    expect(await sendEmail("a@b.de", "S", "<p/>")).toBe(false);
    expect(String(inserts[0].body)).toMatch(/Schlüssel ungültig/);
    expect(String(inserts[0].body)).not.toContain("re_testtesttest123456");
  });
  it("simulierter Fehlertext mit Schlüssel/Bearer wird in Konsole und DB-Log geschwärzt", async () => {
    const leaked = "re_LEAKEDkey9876543210";
    vi.stubGlobal(
      "fetch",
      respond(401, { name: "validation_error", message: `API key is invalid: ${leaked} (Authorization: Bearer ${leaked})` }),
    );
    expect(await sendEmail("a@b.de", "S", "<p/>")).toBe(false);
    const consoleOut = errorSpy.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n");
    expect(consoleOut).toContain("Resend send failed");
    expect(consoleOut).not.toContain("LEAKEDkey");
    expect(String(inserts[0].body)).not.toContain("LEAKEDkey");
    expect(String(inserts[0].body)).toContain("re_***");
  });
  it("429 Hinweis verspricht keine Wiederholung", () => {
    const h = classifyResendError(429, "x").hint ?? "";
    expect(h).toBe("Vorübergehende Störung beim Mailanbieter; Versand nicht erfolgt.");
    expect(h).not.toMatch(/erneut/);
  });
  it("restricted_api_key → false, Berechtigungshinweis", async () => {
    vi.stubGlobal("fetch", respond(401, { name: "restricted_api_key", message: "restricted" }));
    expect(await sendEmail("a@b.de", "S", "<p/>")).toBe(false);
    expect(String(inserts[0].body)).toMatch(/Berechtigung/);
  });
  it("403 unverified domain → false, Domainhinweis", async () => {
    vi.stubGlobal("fetch", respond(403, { name: "validation_error", message: "The domain is not verified" }));
    expect(await sendEmail("a@b.de", "S", "<p/>")).toBe(false);
    expect(String(inserts[0].body)).toMatch(/Domain/);
    expect(String(inserts[0].body)).not.toMatch(/ungültig/);
  });
  it("simulierter erfolgreicher Versand → true, kein Fehlerprotokoll", async () => {
    vi.stubGlobal("fetch", respond(200, { id: "msg_1" }));
    expect(await sendEmail("a@b.de", "S", "<p/>")).toBe(true);
    expect(inserts).toHaveLength(0);
  });
});
