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
  freezeMail,
  SAFE_IDEMPOTENCY_SECONDS,
  type ConfirmationDeps,
  type CustomerMailRow,
  type FrozenMail,
  type ReservationForMail,
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
  it.each([",", ".", "129,", ",50", "1.2a", "12 3x", "", "   ", "-5", "−5", "12,345", "abc", "1,2,3", "12.3.4", "NaN", "1e3", "99999999"])(
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
    expect(confirmationBlocker({ ...base, totalPriceCents: null })).toMatch(/preis/i);
    expect(confirmationBlocker({ ...base, pickupAddress: null })).toMatch(/Abholort/);
    expect(confirmationBlocker({ ...base, customerEmail: "kaputt@" })).toMatch(/E-Mail/);
    expect(confirmationBlocker(base)).toBeNull();
  });
  it("Absender exakt festgelegt", () => {
    expect(CONFIRMATION_FROM).toBe("MyTransporter <info@mytransporter.org>");
    expect(CONFIRMATION_REPLY_TO).toBe("info@mytransporter.org");
  });
});

const TARGET = { reservationId: base.reservationId, revision: base.revision };

/** Simuliert die DB-Funktionen (Claim/Complete/Fail mit Fencing) im Speicher. */
function makeDeps(over: Partial<ConfirmationDeps> = {}, res: Partial<ReservationForMail> = {}) {
  let reservation: ReservationForMail = { ...base, confirmationRequested: true, ...res };
  const db = {
    row: null as null | (CustomerMailRow & {
      ambiguous: boolean; lease_token: string | null; lease_until: number; first_attempt_at: number | null; provider: string | null;
    }),
    now: Date.parse("2026-10-07T10:00:00Z"),
  };
  const sent: Array<{ mail: FrozenMail; key: string }> = [];
  let tok = 0;
  const deps: ConfirmationDeps = {
    loadReservation: async () => reservation,
    getRow: async (_id, rev) => (db.row && db.row.revision === rev ? db.row : null),
    insertRow: async (r) => {
      db.row ??= { id: "row1", status: "pending", ambiguous: false, lease_token: null, lease_until: 0, first_attempt_at: null, provider: null, ...r };
      return db.row;
    },
    claim: async () => {
      const r = db.row!;
      if (r.status === "sent") return { result: "sent" };
      if (r.status === "processing" && r.lease_until > db.now) return { result: "in_progress" };
      if ((r.status === "processing" || r.ambiguous) && r.first_attempt_at != null && r.first_attempt_at < db.now - SAFE_IDEMPOTENCY_SECONDS * 1000)
        return { result: "needs_review" };
      const prior = r.ambiguous || r.status === "processing";
      Object.assign(r, { status: "processing", lease_token: `t${++tok}`, lease_until: db.now + 60_000, ambiguous: true });
      r.first_attempt_at ??= db.now;
      return { result: "claimed", lease_token: r.lease_token!, prior_ambiguous: prior };
    },
    complete: async (_id, t, pid) => {
      const r = db.row!;
      if (r.status !== "processing" || r.lease_token !== t) return false;
      Object.assign(r, { status: "sent", provider: pid, ambiguous: false, lease_token: null });
      return true;
    },
    fail: async (_id, t, _k, _e, amb) => {
      const r = db.row!;
      if (r.status !== "processing" || r.lease_token !== t) return false;
      Object.assign(r, { status: "failed", ambiguous: amb, lease_token: null });
      return true;
    },
    send: async (mail, key) => {
      sent.push({ mail, key });
      return { ok: true, providerId: "re-msg-1" };
    },
    ...over,
  };
  return { deps, db, sent, setReservation: (r: Partial<ReservationForMail>) => (reservation = { ...reservation, ...r }) };
}

describe("runCustomerConfirmation", () => {
  it("sendet an den Kunden (nicht an den Betreiber) mit stabilem Schlüssel und Reply-To", async () => {
    const { deps, sent, db } = makeDeps();
    expect((await runCustomerConfirmation(deps, TARGET)).status).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0].mail.to).toBe("kunde@example.de");
    expect(sent[0].mail.to).not.toBe(OWNER_CALENDAR_EMAIL);
    expect(sent[0].mail.from).toBe(CONFIRMATION_FROM);
    expect(sent[0].mail.reply_to).toBe(CONFIRMATION_REPLY_TO);
    expect(sent[0].key).toBe(`manual-customer-confirmation-${base.reservationId}-r3`);
    expect(db.row!.provider).toBe("re-msg-1");
  });
  it("Doppelklick/Retry sendet nicht erneut", async () => {
    const { deps, sent } = makeDeps();
    await runCustomerConfirmation(deps, TARGET);
    expect(await runCustomerConfirmation(deps, TARGET)).toMatchObject({ status: "sent", already: true });
    expect(sent).toHaveLength(1);
  });
  it("ohne angeforderte Bestätigung oder für veraltete Revision kein Versand", async () => {
    const a = makeDeps({}, { confirmationRequested: false });
    expect((await runCustomerConfirmation(a.deps, TARGET)).status).toBe("blocked");
    const b = makeDeps({}, { revision: 4 });
    expect((await runCustomerConfirmation(b.deps, TARGET)).status).toBe("blocked");
    expect(a.sent.length + b.sent.length).toBe(0);
  });
  it("Inhalt eingefroren: Retry nach Preis-/Adress-/E-Mail-Änderung sendet exakt denselben Payload", async () => {
    let n = 0;
    const { deps, sent, setReservation } = makeDeps({
      send: async (mail, key) => {
        sent.push({ mail, key });
        return ++n === 1
          ? { ok: false, kind: "invalid_key", ambiguous: false, status: 401, error: "API key is invalid" }
          : { ok: true, providerId: "re-2" };
      },
    });
    expect((await runCustomerConfirmation(deps, TARGET)).status).toBe("failed");
    setReservation({ totalPriceCents: 99900, pickupAddress: "Anderswo 1", customerEmail: "neu@example.de" });
    expect((await runCustomerConfirmation(deps, TARGET)).status).toBe("sent");
    expect(sent).toHaveLength(2);
    expect(sent[1].mail).toEqual(sent[0].mail);
    expect(sent[1].mail.text).toContain("129,50 €");
    expect(sent[1].mail.to).toBe("kunde@example.de");
  });
  it("Anbieter nimmt an, DB-Markierung scheitert → nicht als 'nicht gesendet' gemeldet", async () => {
    const { deps } = makeDeps({ complete: async () => { throw new Error("db down"); } });
    expect((await runCustomerConfirmation(deps, TARGET)).status).toBe("accepted_unrecorded");
  });
  it("processing mit abgelaufener Lease > 23 h → Prüfung nötig, kein Versand", async () => {
    const { deps, db, sent } = makeDeps({ complete: async () => false });
    await runCustomerConfirmation(deps, TARGET); // bleibt processing
    sent.length = 0;
    db.now += 24 * 3600_000;
    expect((await runCustomerConfirmation(deps, TARGET)).status).toBe("needs_review");
    expect(sent).toHaveLength(0);
  });
  it("processing mit abgelaufener Lease < 23 h → kontrollierter Retry mit gleichem Schlüssel", async () => {
    const { deps, db, sent } = makeDeps();
    await deps.insertRow({ reservation_id: base.reservationId, revision: 3, recipient_email: "kunde@example.de", idempotency_key: "k", payload: freezeMail(base) });
    await deps.claim("row1"); // abgestürzter Worker
    db.now += 120_000;
    expect((await runCustomerConfirmation(deps, TARGET)).status).toBe("sent");
    expect(sent[0].key).toBe("k");
  });
  it("Fencing: alter Worker kann Erfolg nicht überschreiben", async () => {
    const { deps, db } = makeDeps();
    await runCustomerConfirmation(deps, TARGET);
    expect(await deps.fail("row1", "t1", "network", "spät", true)).toBe(false);
    expect(db.row!.status).toBe("sent");
  });
  it("Timeout/5xx/Crash gelten als unklar; spätere 401 hebt Unklarheit nicht auf", async () => {
    let n = 0;
    const { deps, db } = makeDeps({
      send: async () => {
        if (++n === 1) throw new Error("crash");
        return { ok: false, kind: "invalid_key", ambiguous: false, status: 401, error: "x" };
      },
    });
    expect(await runCustomerConfirmation(deps, TARGET)).toMatchObject({ status: "failed", ambiguous: true });
    expect(await runCustomerConfirmation(deps, TARGET)).toMatchObject({ status: "failed", ambiguous: true });
    expect(db.row!.ambiguous).toBe(true);
  });
  it("Antwort ohne echte ID ist kein Erfolg", async () => {
    const { deps } = makeDeps({ send: async () => ({ ok: true, providerId: "  " }) });
    expect(await runCustomerConfirmation(deps, TARGET)).toMatchObject({ status: "failed", kind: "no_provider_id" });
  });
  it("Altbestand ohne Preis oder fehlende Reservierung: kein Versand", async () => {
    const a = makeDeps({}, { totalPriceCents: null });
    expect((await runCustomerConfirmation(a.deps, TARGET)).status).toBe("blocked");
    const b = makeDeps({ loadReservation: async () => null });
    expect((await runCustomerConfirmation(b.deps, TARGET)).status).toBe("blocked");
    expect(a.sent.length + b.sent.length).toBe(0);
  });
  it("buildCustomerConfirmation verweigert unvollständige Daten statt 0 €", () => {
    expect(() => buildCustomerConfirmation({ ...base, totalPriceCents: null })).toThrow();
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
  it("ID-Objekt statt String ist kein Erfolg", async () => {
    const f = async () => new Response(JSON.stringify({ id: { x: 1 } }), { status: 200 });
    expect(await sendEmailDetailed({ ...args, fetchImpl: f as never })).toMatchObject({ ok: false, kind: "no_provider_id" });
  });
  it("5xx gilt als unklar", async () => {
    const f = async () => new Response("{}", { status: 502 });
    expect(await sendEmailDetailed({ ...args, fetchImpl: f as never })).toMatchObject({ ok: false, ambiguous: true });
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
