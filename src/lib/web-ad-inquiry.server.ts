import {
  WEB_AD_PRICE_NET_EUR,
  WEB_AD_SLOTS,
  WEB_AD_TERM_DAYS,
  WebAdInquirySchema,
  type WebAdInquiryResult,
} from "./web-ad-inquiry";

export interface WebAdInquiryDeps {
  now: () => Date;
  /** Anzahl Anfragen seit `since` (gesamt bzw. für diese E-Mail). Wirft bei DB-Fehler. */
  countRecent: (since: Date, email?: string) => Promise<number>;
  /** Speichert die Anfrage; true nur bei bestätigtem Insert. */
  store: (title: string, body: string) => Promise<boolean>;
  /** Mail an Betreiber; true nur bei vom Anbieter angenommenem Versand. */
  mail: (subject: string, html: string) => Promise<boolean>;
}

export const PER_EMAIL_LIMIT = 2; // pro 10 Minuten
export const GLOBAL_HOURLY_LIMIT = 30;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Serverseitige Verarbeitung; Erfolg nur bei bestätigtem Speichern oder Mailversand. */
export async function processWebAdInquiry(raw: unknown, deps: WebAdInquiryDeps): Promise<WebAdInquiryResult> {
  const parsed = WebAdInquirySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Angaben." };
  }
  const d = parsed.data;
  if (d.hp.trim() !== "") return { ok: false, error: "Anfrage konnte nicht angenommen werden." };

  const now = deps.now();
  // Vergleich nach Berliner Kalenderdatum (Schema garantiert echtes Datum).
  if (d.startDate && d.startDate < berlinToday(now)) {
    return { ok: false, error: "Der gewünschte Start liegt in der Vergangenheit." };
  }

  try {
    const perEmail = await deps.countRecent(new Date(now.getTime() - 10 * 60_000), d.email.toLowerCase());
    if (perEmail >= PER_EMAIL_LIMIT) {
      return { ok: false, error: "Zu viele Anfragen in kurzer Zeit. Bitte versuche es später erneut." };
    }
    const global = await deps.countRecent(new Date(now.getTime() - 60 * 60_000));
    if (global >= GLOBAL_HOURLY_LIMIT) {
      return { ok: false, error: "Zu viele Anfragen in kurzer Zeit. Bitte versuche es später erneut." };
    }
  } catch {
    // Fail closed: ohne Prüfung keine Annahme.
    return { ok: false, error: "Anfrage konnte gerade nicht verarbeitet werden. Bitte später erneut versuchen." };
  }

  const slot = WEB_AD_SLOTS[d.slot];
  const price = `${WEB_AD_PRICE_NET_EUR} € netto / ${WEB_AD_TERM_DAYS} Tage zzgl. USt.`;
  const title = `Website-Werbeplatz-Anfrage: ${d.company} (${slot})`;
  const body = [
    `Firma: ${d.company}`,
    `Ansprechpartner: ${d.contactName}`,
    `E-Mail: ${d.email.toLowerCase()}`,
    `Website: ${d.website || "-"}`,
    `Platz: ${slot}`,
    `Gewünschter Start: ${d.startDate || "offen"}`,
    `Preis laut Seite: ${price}`,
    d.message ? `\n${d.message}` : "",
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;padding:24px;color:#111">
<h2 style="margin:0 0 16px">Neue Anfrage Website-Werbeplatz</h2>
<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px">${esc(body)}</pre>
<p style="font-size:12px;color:#666">Unverbindliche Anfrage – keine Buchung, keine Zahlung.</p></div>`;

  let stored = false;
  let mailed = false;
  try {
    stored = await deps.store(title, body);
  } catch {
    stored = false;
  }
  try {
    mailed = await deps.mail(title, html);
  } catch {
    mailed = false;
  }
  if (!stored && !mailed) {
    return { ok: false, error: "Anfrage konnte nicht gesendet werden. Bitte versuche es erneut oder schreib an info@mytransporter.org." };
  }
  return { ok: true, stored, mailed };
}
