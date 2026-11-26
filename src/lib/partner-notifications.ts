/**
 * Interne Partner-Benachrichtigungen (nur an info@mytransporter.org).
 * Reine, browser-sichere Logik: Ereignisschlüssel, Mailinhalt, Limits.
 */
import { formatEuro, partnerTrackingUrl } from "@/lib/partner-tracking";

/** Empfänger fest serverseitig – nie vom Client wählbar. */
export const PARTNER_NOTIFY_RECIPIENT = "info@mytransporter.org";
export const PARTNER_ADMIN_URL = "https://mytransporter.org/admin";
/** Abuse-Deckel für Scan-Mails je Partner (in der DB-Funktion identisch). */
export const SCAN_MAIL_LIMIT = { perHour: 10, perDay: 50 } as const;
export const MAX_NOTIFY_ATTEMPTS = 8;

export type PartnerNotifyKind = "scan" | "signup" | "booking_paid" | "test";
export type PartnerNotifyPayload = {
  partnerName: string; slug: string; occurredAt: string; ref: string;
  bookingReference?: string; rentCents?: number; commissionCents?: number; ratePercent?: number; status?: string;
};

export const partnerEventKey = (kind: PartnerNotifyKind, id: string) => `${kind}:${id}`;

export function formatBerlin(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "unbekannt";
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "medium" }).format(d) + " (Europe/Berlin)";
}

const TITLES: Record<PartnerNotifyKind, string> = {
  scan: "QR-Code aufgerufen",
  signup: "Neue Registrierung über QR-Code",
  booking_paid: "Bezahlte Buchung über QR-Code",
  test: "TEST – Partner-Benachrichtigung",
};

export function buildPartnerNotification(kind: PartnerNotifyKind, p: PartnerNotifyPayload) {
  const isTest = kind === "test";
  const subject = `${isTest ? "[TEST] " : ""}Partner ${p.partnerName} · ${TITLES[kind]}`;
  const rows: { label: string; value: string }[] = [
    { label: "Partner", value: p.partnerName },
    { label: "QR-Kurzname", value: p.slug },
    { label: "Trackinglink", value: partnerTrackingUrl(p.slug) },
    { label: "Ereignis", value: TITLES[kind] },
    { label: "Zeit", value: formatBerlin(p.occurredAt) },
    { label: "Interne Referenz", value: p.ref },
  ];
  if (kind === "booking_paid" || isTest) {
    if (p.bookingReference) rows.push({ label: "Buchungsreferenz", value: p.bookingReference });
    if (p.status) rows.push({ label: "Zahlungsstatus", value: p.status === "paid" ? "bezahlt" : p.status });
    if (typeof p.rentCents === "number") rows.push({ label: "Mieterlös ohne Kaution", value: formatEuro(p.rentCents) });
    if (typeof p.commissionCents === "number") rows.push({ label: `Provision${p.ratePercent != null ? ` (${p.ratePercent} %)` : ""}`, value: formatEuro(p.commissionCents) });
  }
  const intro: string[] = [];
  if (isTest) intro.push("Dies ist ein TEST. Es gab keinen echten Scan, keine Registrierung und keine Buchung.");
  if (kind === "scan") intro.push("Der QR-Code wurde aufgerufen. Wer gescannt hat, ist nicht bekannt (keine Identität, keine IP).");
  if (kind === "signup") intro.push("Ein neues Konto wurde nach einem Scan dieses QR-Codes angelegt und per E-Mail bestätigt.");
  if (kind === "booking_paid") intro.push("Eine Buchung aus dieser QR-Herkunft wurde bezahlt. Provision nach Erstattungen siehe Admin.");
  return { subject, heading: TITLES[kind], intro, rows };
}

/** Wartezeit bis zum nächsten Versuch (Sekunden). */
export const retryDelaySeconds = (attempts: number) => Math.min(3600, 60 * 2 ** Math.max(0, attempts - 1));
