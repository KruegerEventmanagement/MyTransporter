import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import {
  buildInvoiceMail,
  buildReviewMail,
  processOutboxRow,
  reviewDueAt,
  validateGoogleReviewUrl,
  outboxIdempotencyKey,
  OUTBOX_FROM,
  type OutboxClaim,
  type OutboxDeps,
  type OutboxRow,
} from "@/lib/customer-mail-outbox";
import { LOGO_URL } from "@/lib/email-template";
import { isConfirmationOutdated, sendEmailDetailed, type DetailedSendResult } from "@/lib/booking-emails.server";
import { berlinWallToIso } from "@/lib/customer-mail-outbox.server";

const REVIEW = "https://www.google.com/maps?cid=9407266905378611223";

function invoiceRow(): OutboxRow {
  return {
    id: "row-1",
    source_type: "booking",
    source_id: "b1",
    kind: "invoice",
    status: "scheduled",
    idempotency_key: outboxIdempotencyKey("booking", "b1", "invoice"),
    recipient_email: "kunde@example.org",
    payload: buildInvoiceMail({
      firstName: "Anna", to: "kunde@example.org", invoiceNo: "MT-202610-ABC123", vehicle: "Jumper · BB-MT 1",
      start: "Freitag, 16. Oktober 2026 um 10:00", totalCents: 29900, paid: true, bookingUrl: "https://mytransporter.org/trip/b1",
      archiveId: "arch-1", filename: "MyTransporter-Rechnung-MT-202610-ABC123.pdf",
    }),
  };
}

/** In-Memory-Nachbildung der Claim-/Fencing-Regeln aus claim_customer_mail. */
function fakeDeps(send: () => Promise<DetailedSendResult>, over: Partial<OutboxDeps> = {}) {
  const state = { status: "scheduled", token: "", firstAttempt: 0, ambiguous: false, sends: 0, completes: 0, fails: [] as string[] };
  const deps: OutboxDeps = {
    precheck: async () => null,
    cancel: async () => { state.status = "cancelled"; },
    claim: async (): Promise<OutboxClaim> => {
      if (state.status === "sent") return { result: "sent" };
      if (state.status === "processing") return { result: "in_progress" };
      const prior = state.ambiguous;
      state.status = "processing"; state.token = `t${Math.random()}`; state.ambiguous = true;
      return { result: "claimed", lease_token: state.token, prior_ambiguous: prior };
    },
    loadAttachment: async () => "JVBERi0=",
    send: async () => { state.sends++; return send(); },
    complete: async (_id, tok, pid) => {
      if (tok !== state.token || !pid.trim()) return false;
      state.status = "sent"; state.completes++; state.ambiguous = false; return true;
    },
    fail: async (_id, tok, kind, _e, amb) => {
      if (tok !== state.token) return false;
      state.status = "failed"; state.ambiguous = amb; state.fails.push(kind); return true;
    },
    ...over,
  };
  return { deps, state };
}

describe("Fälligkeit & Link", () => {
  it("Bewertungsanfrage genau 24 h nach Buchung, nie früher", () => {
    expect(reviewDueAt("2026-10-15T10:00:00Z").toISOString()).toBe("2026-10-16T10:00:00.000Z");
    // über DST-Wechsel (25.10.2026): weiterhin exakt 24 h
    expect(reviewDueAt("2026-10-24T22:30:00Z").toISOString()).toBe("2026-10-25T22:30:00.000Z");
  });
  it("akzeptiert nur direkte Google-Bewertungslinks", () => {
    expect(validateGoogleReviewUrl(REVIEW)).toBe(REVIEW);
    expect(validateGoogleReviewUrl("https://search.google.com/local/writereview?placeid=ChIJabcdefghij")).toBeTruthy();
    expect(validateGoogleReviewUrl("https://www.google.com/search?q=MyTransporter+Leonberg")).toBeNull();
    expect(validateGoogleReviewUrl("http://g.page/r/CabcdefGHIJ123/review")).toBeNull();
    expect(validateGoogleReviewUrl("")).toBeNull();
    expect(() => buildReviewMail({ firstName: null, to: "a@b.de", reviewUrl: "", optOutToken: "x" })).toThrow();
  });
  it("bestätigter Maps-Profillink mit CID wird akzeptiert, Varianten mit Query/Redirect nicht", () => {
    const real = "https://www.google.com/maps?cid=9407266905378611223";
    expect(validateGoogleReviewUrl(real)).toBe(real);
    expect(validateGoogleReviewUrl("https://www.google.com/maps?cid=9407266905378611223&q=x")).toBeNull();
    expect(validateGoogleReviewUrl("https://www.google.com/maps?cid=abc")).toBeNull();
    expect(validateGoogleReviewUrl("https://www.google.com/maps?q=MyTransporter")).toBeNull();
    expect(validateGoogleReviewUrl("https://www.google.com/url?cid=9407266905378611223")).toBeNull();
    expect(validateGoogleReviewUrl("https://user:pw@www.google.com/maps?cid=9407266905378611223")).toBeNull();
    expect(validateGoogleReviewUrl("https://www.google.com.evil.de/maps?cid=9407266905378611223")).toBeNull();
  });
  it("Berlin-Wandzeit wird DST-korrekt umgerechnet", () => {
    expect(berlinWallToIso("2026-07-01", 10)).toBe("2026-07-01T08:00:00.000Z");
    expect(berlinWallToIso("2026-12-01", 10)).toBe("2026-12-01T09:00:00.000Z");
  });
  it("Bestätigungen älter als 23 h werden nicht nachgesendet", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(isConfirmationOutdated("2026-10-14T13:30:00Z", now)).toBe(false);
    expect(isConfirmationOutdated("2026-10-14T12:00:00Z", now)).toBe(true);
  });
});

describe("Vorlagen", () => {
  it("Rechnung: Logo, Absender, PDF-Pflichtanhang, HTML + Text", () => {
    const m = invoiceRow().payload!;
    expect(m.from).toBe(OUTBOX_FROM);
    expect(m.reply_to).toBe("info@mytransporter.org");
    expect(m.html).toContain(LOGO_URL);
    expect(m.html).toContain("Hallo Anna,");
    expect(m.text).toContain("MT-202610-ABC123");
    expect(m.attachment?.archive_id).toBe("arch-1");
  });
  it("manuelle Rechnung wird nicht als bezahlt bezeichnet", () => {
    const m = buildInvoiceMail({ firstName: null, to: "a@b.de", invoiceNo: "MT-M-1", vehicle: "x", start: "y", totalCents: 100, paid: false, bookingUrl: null, archiveId: "a", filename: "f.pdf" });
    expect(m.text).not.toMatch(/bezahlt/);
  });
  it("Bewertung: neutral, Abmeldelink, kein Anreiz/Sternefilter", () => {
    const m = buildReviewMail({ firstName: "Max", to: "a@b.de", reviewUrl: REVIEW, optOutToken: "tok-1" });
    expect(m.html).toContain(REVIEW);
    expect(m.text).toContain("review-opt-out?t=tok-1");
    expect(m.text).toMatch(/ehrlichen? Bewertung/);
    expect(`${m.text}`).not.toMatch(/Gutschein|Rabatt|5 Sterne|fünf Sterne/i);
    expect(m.subject).toBe("Deine Erfahrung mit MyTransporter");
    expect(m.text).not.toMatch(/Wie war deine Miete/);
    expect(m.text).toContain("vielen Dank für deine Buchung");
  });
});

describe("Versandablauf", () => {
  it("Erfolg nur mit Provider-ID; zweiter Lauf sendet nicht erneut", async () => {
    const { deps, state } = fakeDeps(async () => ({ ok: true, providerId: "re_msg_1" }));
    expect((await processOutboxRow(deps, invoiceRow())).status).toBe("sent");
    expect((await processOutboxRow(deps, invoiceRow())).status).toBe("skipped");
    expect(state.sends).toBe(1);
  });
  it("parallele Läufe: nur einer sendet", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { deps, state } = fakeDeps(async () => { await gate; return { ok: true, providerId: "re_1" }; });
    const a = processOutboxRow(deps, invoiceRow());
    const b = processOutboxRow(deps, invoiceRow());
    release();
    const res = await Promise.all([a, b]);
    expect(res.map((r) => r.status).sort()).toEqual(["sent", "skipped"]);
    expect(state.sends).toBe(1);
  });
  it.each([
    [{ ok: false, kind: "invalid_key", ambiguous: false, status: 401, error: "API key is invalid" }, false],
    [{ ok: false, kind: "transient", ambiguous: false, status: 429, error: "rate" }, false],
    [{ ok: false, kind: "transient", ambiguous: true, status: 503, error: "down" }, true],
    [{ ok: false, kind: "timeout", ambiguous: true, status: null, error: "t" }, true],
  ] as const)("Fehler %# bleibt retrybar mit korrekter Unklarheit", async (r, amb) => {
    const { deps, state } = fakeDeps(async () => r as DetailedSendResult);
    const out = await processOutboxRow(deps, invoiceRow());
    expect(out.status).toBe("failed");
    expect(state.ambiguous).toBe(amb);
  });
  it("2xx ohne Provider-ID gilt als unklar", async () => {
    const { deps, state } = fakeDeps(async () => ({ ok: true, providerId: "  " }));
    expect((await processOutboxRow(deps, invoiceRow())).status).toBe("failed");
    expect(state.ambiguous).toBe(true);
  });
  it("Anbieter angenommen, DB-Update fehlgeschlagen ⇒ angenommen/Prüfung, nicht 'nicht gesendet'", async () => {
    const { deps } = fakeDeps(async () => ({ ok: true, providerId: "re_2" }), { complete: async () => { throw new Error("db"); } });
    expect((await processOutboxRow(deps, invoiceRow())).status).toBe("accepted_unrecorded");
  });
  it("Pflicht-PDF fehlt ⇒ kein Versand ohne Anhang", async () => {
    const { deps, state } = fakeDeps(async () => ({ ok: true, providerId: "x" }), { loadAttachment: async () => { throw new Error("weg"); } });
    expect((await processOutboxRow(deps, invoiceRow())).status).toBe("failed");
    expect(state.sends).toBe(0);
  });
  it("Prüfung nötig (Idempotenzfenster abgelaufen) ⇒ kein Blindversand", async () => {
    const { deps, state } = fakeDeps(async () => ({ ok: true, providerId: "x" }), { claim: async () => ({ result: "needs_review" }) });
    expect((await processOutboxRow(deps, invoiceRow())).status).toBe("skipped");
    expect(state.sends).toBe(0);
  });
  it("Abmeldestatus nicht prüfbar (DB-Fehler) ⇒ kein Versand, keine Änderung", async () => {
    const cancel = vi.fn();
    const { deps, state } = fakeDeps(async () => ({ ok: true, providerId: "x" }), {
      precheck: async () => { throw new Error("db down"); }, cancel,
    });
    const out = await processOutboxRow(deps, { ...invoiceRow(), kind: "review_request" });
    expect(out.status).toBe("failed");
    expect(state.sends).toBe(0);
    expect(cancel).not.toHaveBeenCalled();
    expect(state.status).toBe("scheduled");
  });
  it("Storno/Abmeldung/gelöschtes Konto bricht Bewertungsanfrage ab", async () => {
    for (const reason of ["Buchung storniert", "Empfänger hat widersprochen", "Konto gelöscht/inaktiv"]) {
      const { deps, state } = fakeDeps(async () => ({ ok: true, providerId: "x" }), { precheck: async () => reason });
      const out = await processOutboxRow(deps, { ...invoiceRow(), kind: "review_request" });
      expect(out).toEqual({ status: "cancelled", reason });
      expect(state.sends).toBe(0);
    }
  });
});

describe("sendEmailDetailed", () => {
  it("überträgt Anhang + Idempotenz-Schlüssel und erkennt 401", async () => {
    process.env.RESEND_API_KEY = "re_testkey_123456789";
    const calls: RequestInit[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      calls.push(init);
      return new Response(JSON.stringify({ name: "validation_error", message: "API key is invalid" }), { status: 401 });
    }) as unknown as typeof fetch;
    const r = await sendEmailDetailed({ from: "a", to: "b@c.de", subject: "s", html: "h", idempotencyKey: "k1", attachments: [{ filename: "r.pdf", content: "JVBE" }], fetchImpl: f });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("invalid_key");
      expect(r.ambiguous).toBe(false);
      expect(r.error).not.toContain("re_testkey");
    }
    const body = JSON.parse(String(calls[0].body));
    expect(body.attachments[0].filename).toBe("r.pdf");
    expect((calls[0].headers as Record<string, string>)["Idempotency-Key"]).toBe("k1");
  });
});
