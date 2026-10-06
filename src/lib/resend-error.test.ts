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

beforeEach(() => {
  inserts.length = 0;
  process.env.RESEND_API_KEY = "re_testtesttest123456";
});
afterEach(() => vi.unstubAllGlobals());

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

describe("sendEmail Wahrheit gesendet/nicht gesendet", () => {
  it("echter 401 invalid key → false + Hinweis, kein Secret im Log", async () => {
    vi.stubGlobal("fetch", respond(401, { statusCode: 401, name: "validation_error", message: "API key is invalid" }));
    expect(await sendEmail("a@b.de", "S", "<p/>")).toBe(false);
    expect(String(inserts[0].body)).toMatch(/Schlüssel ungültig/);
    expect(String(inserts[0].body)).not.toContain("re_testtesttest123456");
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
  it("erfolgreicher Versand → true, kein Fehlerprotokoll", async () => {
    vi.stubGlobal("fetch", respond(200, { id: "msg_1" }));
    expect(await sendEmail("a@b.de", "S", "<p/>")).toBe(true);
    expect(inserts).toHaveLength(0);
  });
});
