/**
 * Schlüssel-SMS: Versandablauf ohne direkten Serverzugriff (Store + Provider injiziert),
 * damit Produktion, Admin-Test und Tests exakt denselben Pfad nutzen.
 * Ablauf: claim (Token) → Prüfungen → mark_sending (Versuch zählt) → Provider → finish.
 * Unklare Ergebnisse (Timeout, Netzwerk, 5xx, unlesbare Antwort, Abbruch während des Sendens)
 * werden nie automatisch wiederholt – lieber eine fehlende SMS als eine doppelte.
 */
import { KEY_SMS_SENDER, buildKeySms, normalizePhone, smsSegments } from "./key-sms";
import { isKeyCodeDue } from "./key-handover";

export type SmsSrc = "booking" | "manual" | "test";
export type SmsResult = { kind: "sent"; id: string } | { kind: "rejected"; error: string } | { kind: "unknown"; error: string };
export type ClaimResult = { result: "claimed"; token: string } | { result: "skip"; status?: string } | { result: "stale_sending" };

export interface KeySmsStore {
  claim(type: SmsSrc, id: string): Promise<ClaimResult>;
  markSending(type: SmsSrc, id: string, token: string): Promise<boolean>;
  finish(type: SmsSrc, id: string, token: string, status: "sent" | "failed" | "no_phone" | "unknown" | "cancelled", providerId: string | null, error: string | null): Promise<string | null>;
  note(type: SmsSrc, id: string, title: string, body: string): Promise<void>;
}

export interface KeySmsJob {
  type: SmsSrc;
  id: string;
  plate: string;
  rawPhone: string | null;
  label: string;
  /** Unmittelbar vor dem Senden erneut geprüft (z. B. Buchung inzwischen storniert). */
  stillEligible: () => Promise<boolean>;
  keyCode: () => Promise<string | null>;
  /** Fester Text (Admin-Test); sonst Standardtext aus Kennzeichen + Code. */
  buildText?: (plate: string, code: string) => string | null;
}

export type SendFn = (to: string, text: string) => Promise<SmsResult>;

export const SEVEN_URL = "https://gateway.seven.io/api/sms";
export const SEVEN_TIMEOUT_MS = 10_000;

/** Request-Body für seven.io – bewusst ohne debug/sandbox-Parameter. */
export function sevenBody(to: string, text: string) {
  return { to, text, from: KEY_SMS_SENDER, json: 1 };
}

/** seven.io-Aufruf mit Ergebnis-Klassifikation. */
export async function sendSeven(fetchFn: typeof fetch, apiKey: string, to: string, text: string, timeoutMs = SEVEN_TIMEOUT_MS): Promise<SmsResult> {
  let res: Response;
  try {
    res = await fetchFn(SEVEN_URL, {
      method: "POST",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(sevenBody(to, text)),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // Timeout/Netzwerk: Anfrage kann beim Provider angekommen sein.
    return { kind: "unknown", error: `Keine Antwort (${e instanceof Error ? e.name : "Fehler"})` };
  }
  let body = "";
  try { body = await res.text(); } catch { return { kind: "unknown", error: `HTTP ${res.status}, Antwort abgebrochen` }; }
  if (res.status >= 500) return { kind: "unknown", error: `HTTP ${res.status}` };
  if (!res.ok) return { kind: "rejected", error: `HTTP ${res.status}: ${body.slice(0, 120)}` };
  let j: { success?: unknown; messages?: { id?: unknown; success?: unknown; error_text?: unknown }[] };
  try { j = JSON.parse(body); } catch {
    // Plain-Code wie "900" = eindeutige Ablehnung; alles andere unklar.
    const t = body.trim();
    if (/^\d{3}$/.test(t) && t !== "100") return { kind: "rejected", error: `seven.io Code ${t}` };
    return { kind: "unknown", error: "Antwort unlesbar" };
  }
  const code = typeof j === "number" || typeof j === "string" ? String(j) : String(j?.success ?? "");
  const msg = j?.messages?.[0];
  if (code === "100") {
    if (msg && msg.success !== false && msg.id != null && String(msg.id) !== "") return { kind: "sent", id: String(msg.id) };
    if (msg && msg.success === false) return { kind: "rejected", error: `seven.io: ${String(msg.error_text ?? "Nachricht abgelehnt")}` };
    return { kind: "unknown", error: "Code 100 ohne Nachrichten-ID" };
  }
  // 308 = Debug-Modus: nichts versendet → niemals als Erfolg werten.
  if (/^\d{3}$/.test(code)) return { kind: "rejected", error: `seven.io Code ${code}` };
  return { kind: "unknown", error: "Antwort ohne Statuscode" };
}

export type ProcessOutcome = "sent" | "failed" | "gave_up" | "no_phone" | "unknown" | "cancelled" | "skipped" | "lost_lease";

export async function processKeySms(store: KeySmsStore, send: SendFn, job: KeySmsJob): Promise<ProcessOutcome> {
  const { type, id, plate, label } = job;
  const c = await store.claim(type, id);
  if (c.result === "stale_sending") {
    await store.note(type, id, `Schlüssel-SMS unklar – ${label}`, `${plate}: Abbruch während des Sendens. Bitte Empfang prüfen, nicht automatisch wiederholt.`);
    return "unknown";
  }
  if (c.result !== "claimed") return "skipped";
  const token = c.token;

  if (!(await job.stillEligible())) {
    await store.finish(type, id, token, "cancelled", null, "Buchung nicht mehr berechtigt");
    return "cancelled";
  }
  const phone = normalizePhone(job.rawPhone);
  const code = phone ? await job.keyCode() : null;
  const text = code ? (job.buildText ?? buildKeySms)(plate, code) : null;
  if (!phone || !text) {
    const why = !phone ? "keine gültige Handynummer" : "kein Code/Tresor";
    const s = await store.finish(type, id, token, "no_phone", null, why);
    if (s) await store.note(type, id, `Schlüssel-SMS nicht gesendet – ${label}`, `${plate}: ${why}`);
    return s ? "no_phone" : "lost_lease";
  }
  if (!(await store.markSending(type, id, token))) return "lost_lease";

  const r = await send(phone, text);
  if (r.kind === "sent") {
    const s = await store.finish(type, id, token, "sent", r.id, null);
    await store.note(type, id, `Schlüssel-SMS gesendet – ${label}`, `${plate} · ${smsSegments(text)} SMS-Teile${s ? "" : " (Status nachträglich prüfen)"}`);
    return "sent";
  }
  if (r.kind === "unknown") {
    await store.finish(type, id, token, "unknown", null, r.error);
    await store.note(type, id, `Schlüssel-SMS unklar – ${label}`, `${plate}: ${r.error}. Bitte Empfang prüfen, nicht automatisch wiederholt.`);
    return "unknown";
  }
  const s = await store.finish(type, id, token, "failed", null, r.error);
  if (s === "gave_up") {
    await store.note(type, id, `Schlüssel-SMS fehlgeschlagen – ${label}`, `${plate}: ${r.error}`);
    return "gave_up";
  }
  return s === "failed" ? "failed" : "lost_lease";
}

/** Abholbeginn (Europe/Berlin, inkl. Sommer-/Winterzeit) in UTC-Millisekunden. */
export function berlinStartMs(date: string, hour: number): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return guess - (asUtc - guess);
}

export const KEY_SMS_BOOKING_STATUSES = ["paid", "active", "in_progress", "picked_up"] as const;

export function bookingSmsDue(b: { status: string; start_date: string; start_hour: number }, now: number): boolean {
  return (KEY_SMS_BOOKING_STATUSES as readonly string[]).includes(b.status) && isKeyCodeDue(berlinStartMs(b.start_date, b.start_hour), now);
}

/** Fester Admin-Testtext: eindeutig TEST, Dummy-Code, keine Kundendaten. */
export const KEY_SMS_TEST_CODE = "0000";
export function buildKeySmsTestText(): string {
  return "MyTransporter TEST-SMS: Dies ist ein technischer Test ohne Buchung. Dummy-Code: 0000 (kein echter Schluesselcode). Bitte ignorieren.";
}
