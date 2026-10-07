import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/push.functions", () => ({ pushToAdmins: vi.fn() }));

import { parseEuroToCents, formatCents, centsToInput } from "@/lib/money-input";
import {
  buildCustomerConfirmation,
  confirmationBlocker,
  confirmationIdempotencyKey,
  CONFIRMATION_FROM,
  CONFIRMATION_REPLY_TO,
  type ConfirmationInput,
} from "@/lib/manual-confirmation";
import {
  runCustomerConfirmation,
  type ConfirmationDeps,
  type CustomerMailRow,
} from "@/lib/manual-confirmation.server";
import { sendEmailDetailed } from "@/lib/booking-emails.server";
import { OWNER_CALENDAR_EMAIL } from "@/lib/manual-notifications";
import { PICKUP_ADDRESS } from "@/lib/seo";

describe("parseEuroToCents", () => {
  it.each([
    ["129", 12900],
    ["129,5", 12950],
    ["129,50", 12950],
    ["129.50", 12950],
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["1.234", 123400],
    [" 89 € ", 8900],
    ["0", 0],
    ["0,10", 10],
  ])("%s → %d", (input, cents) => {
    expect(parseEuroToCents(input)).toEqual({ ok: true, cents });
  });
  it.each(["", "   ", "-5", "−5", "12,345", "abc", "1,2,3", "12.3.4", "NaN", "1e3", "99999999"])(
    "lehnt %s ab",
    (input) => {
      expect(parseEuroToCents(input).ok).toBe(false);
    },
  );
  it("formatiert und rundet nie über Float", () => {
    expect(formatCents(123456)).toBe("1.234,56 €");
    expect(centsToInput(12950)).toBe("129,50");
    expect(centsToInput(null)).toBe("");
  });
});

const base: ConfirmationInput = {
  reservationId: "11111111-2222-3333-4444-555555555555",
  revision: 3,
  customerName: "Sadaf <b>Test</b>",
  customerEmail: "kunde@example.de",
  vehicleName: "Citroen Jumper L1H1",
  vehiclePlate: "LEO MY 102",
  startAt: "2026-10-11T07:00:00.000Z", // Sommerzeit → 09:00
  endAt: "2026-10-25T09:00:00.000Z", // Winterzeit → 10:00
  totalPriceCents: 12950,
  pickupAddress: PICKUP_ADDRESS,
};

describe("Kunden-Bestätigung (Vorlage)", () => {
  it("enthält Preis, Abholort, Berliner Zeiten über DST, HTML-escaped", () => {
    const m = buildCustomerConfirmation(base);
    for (const body of [m.html, m.text]) {
      expect(body).toContain("129,50 €");
      expect(body).toContain("Poststraße 60, 71229 Leonberg");
      expect(body).toContain("11.10.2026, 09:00");
      expect(body).toContain("25.10.2026, 10:00");
      expect(body).toContain("MT-11111111");
      expect(body).toContain("LEO MY 102");
      expect(body).not.toMatch(/Römerstraße|Kaution|Code|bezahlt/i);
    }
    expect(m.html).not.toContain("<b>Test</b>");
    expect(m.html).toContain("&lt;b&gt;");
  });
  it("Altbestand ohne Preis/Abholort ist keine vollständige Bestätigung", () => {
    expect(confirmationBlocker({ ...base, totalPriceCents: null })).toMatch(/Preis/);
    expect(confirmationBlocker({ ...base, pickupAddress: null })).toMatch(/Abholort/);
    expect(confirmationBlocker({ ...base, customerEmail: "kaputt@" })).toMatch(/E-Mail/);
    expect(confirmationBlocker(base)).toBeNull();
  });
  it("Absender exakt festgelegt", () => {
    expect(CONFIRMATION_FROM).toBe("MyTransporter <info@mytransporter.org>");
    expect(CONFIRMATION_REPLY_TO).toBe("info@mytransporter.org");
  });
});

function makeDeps(over: Partial<ConfirmationDeps> = {}, rowOver: Partial<CustomerMailRow> = {}) {
  const row: CustomerMailRow = {
    id: "row1",
    reservation_id: base.reservationId,
    revision: base.revision,
    recipient_email: base.customerEmail!,
    idempotency_key: confirmationIdempotencyKey(base.reservationId, base.revision),
    status: "pending",
    attempts: 0,
    ambiguous: false,
    error_kind: null,
    last_error: null,
    provider_message_id: null,
    first_attempt_at: null,
    lease_until: null,
    sent_at: null,
    ...rowOver,
  };
  const sent: Array<{ to: string; idempotencyKey: string; from: string; replyTo: string }> = [];
  const deps: ConfirmationDeps = {
    loadReservation: async () => base,
    ensureRow: async () => row,
    claim: async (r) => {
      if (row.status === "processing" || r.attempts !== row.attempts) return false;
      row.status = "processing";
      row.attempts++;
      row.first_attempt_at ??= new Date().toISOString();
      return true;
    },
    markSent: async (_id, pid) => {
      row.status = "sent";
      row.provider_message_id = pid;
    },
    markFailed: async (_id, kind, _e, amb) => {
      row.status = "failed";
      row.error_kind = kind;
      row.ambiguous = amb;
    },
    send: async (a) => {
      sent.push(a);
      return { ok: true, providerId: "re-msg-1" };
    },
    ...over,
  };
  return { deps, row, sent };
}

describe("runCustomerConfirmation", () => {
  it("sendet an den Kunden (nicht an den Betreiber) mit stabilem Schlüssel", async () => {
    const { deps, sent, row } = makeDeps();
    const r = await runCustomerConfirmation(deps, base.reservationId);
    expect(r.status).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("kunde@example.de");
    expect(sent[0].to).not.toBe(OWNER_CALENDAR_EMAIL);
    expect(sent[0].idempotencyKey).toBe(`manual-customer-confirmation-${base.reservationId}-r3`);
    expect(row.provider_message_id).toBe("re-msg-1");
  });
  it("zweiter Aufruf (Doppelklick/Retry) sendet nicht erneut", async () => {
    const { deps, sent } = makeDeps();
    await runCustomerConfirmation(deps, base.reservationId);
    const again = await runCustomerConfirmation(deps, base.reservationId);
    expect(again).toMatchObject({ status: "sent", already: true });
    expect(sent).toHaveLength(1);
  });
  it("parallel laufender Versand wird nicht doppelt ausgelöst", async () => {
    const { deps, sent } = makeDeps({}, { status: "processing" });
    expect((await runCustomerConfirmation(deps, base.reservationId)).status).toBe("in_progress");
    expect(sent).toHaveLength(0);
  });
  it("401 → failed, kein Erfolg, Retry danach möglich", async () => {
    let call = 0;
    const { deps, row } = makeDeps({
      send: async () =>
        ++call === 1
          ? { ok: false, kind: "invalid_key", ambiguous: false, status: 401, error: "API key is invalid" }
          : { ok: true, providerId: "re-2" },
    });
    const r1 = await runCustomerConfirmation(deps, base.reservationId);
    expect(r1).toMatchObject({ status: "failed", kind: "invalid_key" });
    expect(row.status).toBe("failed");
    const r2 = await runCustomerConfirmation(deps, base.reservationId);
    expect(r2).toMatchObject({ status: "sent", already: false });
    expect(call).toBe(2);
  });
  it("Timeout ist unklar; nach >23 h kein blinder Neuversuch", async () => {
    const t0 = Date.parse("2026-10-07T10:00:00Z");
    let now = t0;
    const { deps, row } = makeDeps({
      now: () => now,
      send: async () => ({ ok: false, kind: "timeout", ambiguous: true, status: null, error: "Zeit" }),
    });
    await runCustomerConfirmation(deps, base.reservationId);
    expect(row.ambiguous).toBe(true);
    row.first_attempt_at = new Date(t0).toISOString();
    now = t0 + 24 * 3600_000;
    const r = await runCustomerConfirmation(deps, base.reservationId);
    expect(r.status).toBe("blocked");
  });
  it("Altbestand ohne Preis: kein Versand", async () => {
    const { deps, sent } = makeDeps({ loadReservation: async () => ({ ...base, totalPriceCents: null }) });
    expect((await runCustomerConfirmation(deps, base.reservationId)).status).toBe("blocked");
    expect(sent).toHaveLength(0);
  });
  it("nicht gespeicherte Reservierung: kein Versand", async () => {
    const { deps, sent } = makeDeps({ loadReservation: async () => null });
    expect((await runCustomerConfirmation(deps, base.reservationId)).status).toBe("blocked");
    expect(sent).toHaveLength(0);
  });
});

describe("sendEmailDetailed", () => {
  const prev = process.env.RESEND_API_KEY;
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_testkey_123456789";
  });
  afterEach(() => {
    process.env.RESEND_API_KEY = prev;
  });
  const args = {
    from: CONFIRMATION_FROM,
    to: "kunde@example.de",
    replyTo: CONFIRMATION_REPLY_TO,
    subject: "S",
    html: "<p>x</p>",
    text: "x",
    idempotencyKey: "k1",
  };
  it("Erfolg nur mit Provider-ID; sendet reply_to, text und Idempotency-Key", async () => {
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body));
      expect(b.reply_to).toBe("info@mytransporter.org");
      expect(b.text).toBe("x");
      expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe("k1");
      return new Response(JSON.stringify({ id: "abc" }), { status: 200 });
    });
    expect(await sendEmailDetailed({ ...args, fetchImpl: f as never })).toEqual({ ok: true, providerId: "abc" });
  });
  it("2xx ohne ID ist kein Erfolg", async () => {
    const f = async () => new Response("{}", { status: 200 });
    expect(await sendEmailDetailed({ ...args, fetchImpl: f as never })).toMatchObject({ ok: false, kind: "no_provider_id" });
  });
  it("401 ungültiger Schlüssel wird erkannt, Schlüssel nicht im Fehlertext", async () => {
    const f = async () =>
      new Response(JSON.stringify({ name: "validation_error", message: "API key is invalid" }), { status: 401 });
    const r = await sendEmailDetailed({ ...args, fetchImpl: f as never });
    expect(r).toMatchObject({ ok: false, kind: "invalid_key", ambiguous: false });
    expect(JSON.stringify(r)).not.toContain("re_testkey");
  });
  it("Zeitüberschreitung → unklar", async () => {
    const f = (_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_, rej) =>
        init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" }))),
      );
    const r = await sendEmailDetailed({ ...args, timeoutMs: 10, fetchImpl: f as never });
    expect(r).toMatchObject({ ok: false, kind: "timeout", ambiguous: true });
  });
  it("fehlender Schlüssel", async () => {
    process.env.RESEND_API_KEY = "  ";
    expect(await sendEmailDetailed(args)).toMatchObject({ ok: false, kind: "missing_key" });
  });
});
