/**
 * Reine Auswertung von Gmail-Unzustellbarkeitsmeldungen (DSN von mailer-daemon).
 * Kein Serverzugriff; liefert nur Empfänger, SMTP-Status und gekürzte Diagnose.
 * Mailinhalte (z. B. Schlüsselcodes) werden nie übernommen: DSNs von Gmail
 * enthalten nur Kopfzeilen, und Ziffernfolgen in der Diagnose werden maskiert.
 */
export type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
};
export type GmailMessage = { id?: string; threadId?: string; internalDate?: string; payload?: GmailPart };

export type ParsedBounce = {
  dsnId: string;
  threadId: string | null;
  recipient: string | null;
  status: string | null;
  diagnostic: string | null;
  permanent: boolean;
  bouncedAt: string | null;
};

/** Neue Bounces nur pushen, wenn sie frisch sind (kein Alarm-Schwall für Altmeldungen). */
export const BOUNCE_ALERT_MAX_AGE_MS = 6 * 3600_000;

function decode(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function statusTexts(part: GmailPart | undefined, inStatus = false, out: string[] = []): string[] {
  if (!part) return out;
  const here = inStatus || part.mimeType === "message/delivery-status";
  if (here && part.body?.data) {
    try { out.push(decode(part.body.data)); } catch { /* unlesbar */ }
  }
  for (const c of part.parts ?? []) statusTexts(c, here, out);
  return out;
}

export function maskDiagnostic(v: string): string {
  return v.replace(/\s+/g, " ").replace(/\b\d{4,}\b/g, "…").trim().slice(0, 300);
}

export function parseGmailBounce(msg: GmailMessage): ParsedBounce | null {
  if (!msg.id) return null;
  const text = statusTexts(msg.payload).join("\n").replace(/\r?\n[ \t]+/g, " ");
  if (!/Final-Recipient:/i.test(text)) return null;
  const recipient = text.match(/Final-Recipient:\s*rfc822;\s*([^\s<>;]+@[^\s<>;]+)/i)?.[1]?.toLowerCase() ?? null;
  const status = text.match(/^Status:\s*([245]\.\d{1,3}\.\d{1,3})/im)?.[1] ?? null;
  const diag = text.match(/^Diagnostic-Code:\s*(?:smtp;\s*)?(.+)$/im)?.[1] ?? null;
  const action = text.match(/^Action:\s*(\w+)/im)?.[1]?.toLowerCase() ?? "failed";
  const ms = Number(msg.internalDate);
  return {
    dsnId: msg.id,
    threadId: msg.threadId ?? null,
    recipient,
    status,
    diagnostic: diag ? maskDiagnostic(diag) : null,
    permanent: action === "failed" && (status?.startsWith("5.") ?? true),
    bouncedAt: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null,
  };
}

/** Verständlicher Grund für den Betreiber. */
export function bounceReason(b: Pick<ParsedBounce, "diagnostic" | "status">): string {
  const d = b.diagnostic ?? "";
  if (/SPF|DKIM|DMARC|AS9031519/i.test(d)) return "Empfänger lehnt ab: Absender-Authentifizierung nicht akzeptiert (Ursache laut Empfängerserver, DNS-Einträge nicht automatisch fehlerhaft)";
  if (/5\.1\.1|does not exist|unknown user|user unknown|no such user/i.test(d)) return "E-Mail-Adresse existiert nicht";
  if (/5\.2\.2|quota|mailbox full/i.test(d)) return "Postfach des Empfängers voll";
  return `Zustellung fehlgeschlagen${b.status ? ` (${b.status})` : ""}`;
}

export function shouldAlert(b: Pick<ParsedBounce, "bouncedAt">, nowMs: number): boolean {
  if (!b.bouncedAt) return false;
  return nowMs - new Date(b.bouncedAt).getTime() <= BOUNCE_ALERT_MAX_AGE_MS;
}

const KIND_LABEL: Record<string, string> = {
  reminder_30min: "Schlüsselcode-Mail",
  reminder_24h: "Abhol-Erinnerung",
  booking_confirmation: "Buchungsbestätigung",
  invoice: "Rechnung",
};

export function bounceTitle(kind: string | null): string {
  if (kind === "reminder_30min") return "⚠️ Schlüsselcode-Mail NICHT zugestellt";
  return `⚠️ ${(kind && KIND_LABEL[kind]) || "Kundenmail"} nicht zugestellt`;
}
