// Schlüssel-SMS Ende-zu-Ende: echte SQL-Migrationen (PGlite) + derselbe processKeySms-Pfad + gemockter seven.io-Server.
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { processKeySms, sendSeven, sevenBody, bookingSmsDue, berlinStartMs, buildKeySmsTestText, type KeySmsStore, type KeySmsJob, type SmsResult } from "./key-sms-core";
import { smsSegments } from "./key-sms";

const mig = (f: string) => readFileSync(new URL(`../../drizzle/migrations/${f}`, import.meta.url), "utf8");
const STUB = `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.has_role(uuid, text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;`;
const B = "11111111-2222-3333-4444-555555555555";

let db: PGlite;
let notes: string[];
const store = (): KeySmsStore => ({
  claim: async (t, id) => (await db.query<{ r: never }>(`SELECT public.key_sms_claim($1,$2) r`, [t, id])).rows[0]!.r,
  markSending: async (t, id, tok) => (await db.query<{ r: boolean }>(`SELECT public.key_sms_mark_sending($1,$2,$3) r`, [t, id, tok])).rows[0]!.r,
  finish: async (t, id, tok, s, p, e) => (await db.query<{ r: string | null }>(`SELECT public.key_sms_finish($1,$2,$3,$4,$5,$6) r`, [t, id, tok, s, p, e])).rows[0]!.r,
  note: async (_t, _id, title) => { notes.push(title); },
});
const row = async () => (await db.query<{ status: string; attempts: number; provider_id: string | null }>(`SELECT status, attempts, provider_id FROM public.key_code_sms`)).rows[0];
const job = (o: Partial<KeySmsJob> = {}): KeySmsJob => ({
  type: "booking", id: B, plate: "LEO MY 101", rawPhone: "0171 2345678", label: "Test",
  stillEligible: async () => true, keyCode: async () => "9999", ...o,
});
type Sent = { to: string; text: string };
const okSender = (log: Sent[]) => async (to: string, text: string): Promise<SmsResult> => { log.push({ to, text }); return { kind: "sent", id: `m${log.length}` }; };

beforeEach(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(mig("0024_key_code_sms.sql"));
  await db.exec(mig("0025_key_sms_fencing.sql"));
  notes = [];
});

describe("Versandpfad mit Leases", () => {
  it("fälliger bezahlter Fall: genau eine SMS mit Box 1, Code und Kennzeichen", async () => {
    const log: Sent[] = [];
    expect(await processKeySms(store(), okSender(log), job())).toBe("sent");
    expect(log).toHaveLength(1);
    expect(log[0]!.to).toBe("+491712345678");
    expect(log[0]!.text).toContain("Box 1");
    expect(log[0]!.text).toContain("Code: 9999");
    expect(await row()).toMatchObject({ status: "sent", attempts: 1, provider_id: "m1" });
    expect(await processKeySms(store(), okSender(log), job())).toBe("skipped");
    expect(log).toHaveLength(1);
  });
  it("Fahrzeugzuordnung 102→2, 1003→3, OF-DK→4; unbekanntes Fahrzeug ohne Versand", async () => {
    for (const [plate, box, id] of [["LEO MY 102", 2, "a"], ["PF MY 1003", 3, "b"], ["OF DK 1234", 4, "c"]] as const) {
      const log: Sent[] = [];
      await processKeySms(store(), okSender(log), job({ plate, id: `00000000-0000-0000-0000-00000000000${id}` }));
      expect(log[0]!.text).toContain(`Box ${box}`);
    }
    const log: Sent[] = [];
    expect(await processKeySms(store(), okSender(log), job({ plate: "LEO MY 999" }))).toBe("no_phone");
    expect(log).toHaveLength(0);
  });
  it("ungültige Nummer (Festnetz/USA) → kein Versand, Admin-Hinweis, kein Retry", async () => {
    const log: Sent[] = [];
    expect(await processKeySms(store(), okSender(log), job({ rawPhone: "07152 12345" }))).toBe("no_phone");
    expect(await processKeySms(store(), okSender(log), job({ rawPhone: "+1 555 1234567" }))).toBe("skipped");
    expect(log).toHaveLength(0);
    expect(notes).toEqual(["Schlüssel-SMS nicht gesendet – Test"]);
  });
  it("inzwischen storniert → cancelled, kein Versand", async () => {
    const log: Sent[] = [];
    expect(await processKeySms(store(), okSender(log), job({ stillEligible: async () => false }))).toBe("cancelled");
    expect(log).toHaveLength(0);
    expect((await row())!.status).toBe("cancelled");
  });
  it("10 parallele Läufe → genau eine Sendung", async () => {
    const log: Sent[] = [];
    const r = await Promise.all(Array.from({ length: 10 }, () => processKeySms(store(), okSender(log), job())));
    expect(log).toHaveLength(1);
    expect(r.filter((x) => x === "sent")).toHaveLength(1);
  });
  it("eindeutige Ablehnung → bis 3 Versuche, dann gave_up mit einem Admin-Hinweis", async () => {
    let calls = 0;
    const rej = async (): Promise<SmsResult> => { calls++; return { kind: "rejected", error: "seven.io Code 500" }; };
    expect(await processKeySms(store(), rej, job())).toBe("failed");
    expect(await processKeySms(store(), rej, job())).toBe("failed");
    expect(await processKeySms(store(), rej, job())).toBe("gave_up");
    expect(await processKeySms(store(), rej, job())).toBe("skipped");
    expect(calls).toBe(3);
    expect(notes).toEqual(["Schlüssel-SMS fehlgeschlagen – Test"]);
  });
  it("Ablehnung, dann Erfolg beim Retry", async () => {
    const log: Sent[] = [];
    await processKeySms(store(), async () => ({ kind: "rejected", error: "x" }), job());
    expect(await processKeySms(store(), okSender(log), job())).toBe("sent");
    expect(await row()).toMatchObject({ status: "sent", attempts: 2 });
  });
  it("Timeout/unklare Zustellung → unknown, nie automatisch wiederholt", async () => {
    let calls = 0;
    expect(await processKeySms(store(), async () => { calls++; return { kind: "unknown", error: "Keine Antwort (TimeoutError)" }; }, job())).toBe("unknown");
    expect(await processKeySms(store(), okSender([]), job())).toBe("skipped");
    expect(calls).toBe(1);
    expect(notes[0]).toMatch(/unklar/);
  });
  it("Crash vor dem Senden (processing, Lease abgelaufen) → sicher neu übernommen", async () => {
    const c = await store().claim("booking", B);
    expect(c.result).toBe("claimed");
    expect(await processKeySms(store(), okSender([]), job())).toBe("skipped"); // Lease noch gültig
    await db.exec(`UPDATE public.key_code_sms SET lease_until = now() - interval '1 second'`);
    const log: Sent[] = [];
    expect(await processKeySms(store(), okSender(log), job())).toBe("sent");
    expect(log).toHaveLength(1);
    // alter Token darf nichts mehr ändern
    expect(await store().markSending("booking", B, (c as { token: string }).token)).toBe(false);
  });
  it("Crash während des Sendens (sending, Lease abgelaufen) → unknown, kein Doppelversand", async () => {
    const c = (await store().claim("booking", B)) as { token: string };
    expect(await store().markSending("booking", B, c.token)).toBe(true);
    await db.exec(`UPDATE public.key_code_sms SET lease_until = now() - interval '1 second'`);
    const log: Sent[] = [];
    expect(await processKeySms(store(), okSender(log), job())).toBe("unknown");
    expect(await processKeySms(store(), okSender(log), job())).toBe("skipped");
    expect(log).toHaveLength(0);
    expect((await row())!.status).toBe("unknown");
    expect(await store().finish("booking", B, c.token, "sent", "late", null)).toBeNull(); // Zombie-Lauf
  });
  it("Test-SMS: fester TEST-Text, Dummy-Code, eigener Doppelklick-Schutz", async () => {
    const log: Sent[] = [];
    const t = job({ type: "test", plate: "TEST", keyCode: async () => "0000", buildText: () => buildKeySmsTestText() });
    expect(await processKeySms(store(), okSender(log), t)).toBe("sent");
    expect(await processKeySms(store(), okSender(log), t)).toBe("skipped");
    expect(log).toHaveLength(1);
    expect(log[0]!.text).toMatch(/^MyTransporter TEST-SMS/);
    expect(log[0]!.text).toContain("0000");
    expect(smsSegments(log[0]!.text)).toBe(1);
  });
});

describe("seven.io-Antworten (gemockter HTTP-Server)", () => {
  const reply = (status: number, body: string) => (async () => new Response(body, { status })) as unknown as typeof fetch;
  it("Request ohne debug, mit json=1 und Absender", async () => {
    let sent: Record<string, unknown> = {};
    const f = (async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response('{"success":"100","messages":[{"id":"77","success":true}]}'); }) as unknown as typeof fetch;
    expect(await sendSeven(f, "k", "+491712345678", "hi")).toEqual({ kind: "sent", id: "77" });
    expect(sent).toEqual(sevenBody("+491712345678", "hi"));
    expect(Object.keys(sent).sort()).toEqual(["from", "json", "text", "to"]);
  });
  it("Erfolg als Zahl 100 akzeptiert", async () => {
    expect(await sendSeven(reply(200, '{"success":100,"messages":[{"id":5,"success":true}]}'), "k", "+49171", "t")).toEqual({ kind: "sent", id: "5" });
  });
  it("308 (Debug) ist KEIN Erfolg", async () => {
    expect((await sendSeven(reply(200, '{"success":"308","messages":[]}'), "k", "+49171", "t")).kind).toBe("rejected");
    expect((await sendSeven(reply(200, "308"), "k", "+49171", "t")).kind).toBe("rejected");
  });
  it("900 Auth, 4xx → eindeutig abgelehnt", async () => {
    expect((await sendSeven(reply(200, "900"), "k", "+49171", "t")).kind).toBe("rejected");
    expect((await sendSeven(reply(401, "no"), "k", "+49171", "t")).kind).toBe("rejected");
  });
  it("100 ohne ID, 5xx, unlesbar, Netzwerk, Timeout → unknown", async () => {
    expect((await sendSeven(reply(200, '{"success":"100","messages":[]}'), "k", "+49171", "t")).kind).toBe("unknown");
    expect((await sendSeven(reply(502, "bad"), "k", "+49171", "t")).kind).toBe("unknown");
    expect((await sendSeven(reply(200, "<html>"), "k", "+49171", "t")).kind).toBe("unknown");
    expect((await sendSeven((async () => { throw new TypeError("net"); }) as unknown as typeof fetch, "k", "+49171", "t")).kind).toBe("unknown");
    const hang = ((_u: string, init: RequestInit) => new Promise<Response>((_r, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("t", "TimeoutError"))))) as unknown as typeof fetch;
    expect(await sendSeven(hang, "k", "+49171", "t", 30)).toEqual({ kind: "unknown", error: "Keine Antwort (TimeoutError)" });
  });
});

describe("15-Minuten-Fenster und Buchungsstatus", () => {
  const start = berlinStartMs("2026-10-30", 10);
  it("Berlin-Zeit inkl. Winter-/Sommerzeit", () => {
    expect(new Date(start).toISOString()).toBe("2026-10-30T09:00:00.000Z");
    expect(new Date(berlinStartMs("2026-07-01", 10)).toISOString()).toBe("2026-07-01T08:00:00.000Z");
  });
  const b = (status: string) => ({ status, start_date: "2026-10-30", start_hour: 10 });
  it("16 Min vorher nein, 15 Min vorher ja, 10 Min nach Start ja, 11 Min danach nein", () => {
    expect(bookingSmsDue(b("paid"), start - 16 * 60_000)).toBe(false);
    expect(bookingSmsDue(b("paid"), start - 15 * 60_000)).toBe(true);
    expect(bookingSmsDue(b("paid"), start + 10 * 60_000)).toBe(true);
    expect(bookingSmsDue(b("paid"), start + 11 * 60_000)).toBe(false);
  });
  it("storniert/ausstehend nie fällig", () => {
    for (const s of ["cancelled", "pending", "refunded", "expired"]) expect(bookingSmsDue(b(s), start)).toBe(false);
  });
});
