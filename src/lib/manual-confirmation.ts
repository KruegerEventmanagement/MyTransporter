/**
 * Kunden-Buchungsbestätigung für manuelle Termine (reine Funktionen).
 * Enthält bewusst KEINE Notizen, Ausweis-/Führerscheindaten, Geburtsdaten,
 * Zahlungsstatus, Kaution, Kilometer oder Zugangscodes.
 */
import { formatBerlin, escapeHtml } from "@/lib/manual-notifications";
import { formatCents } from "@/lib/money-input";
import { BUSINESS } from "@/lib/seo";

export const CONFIRMATION_FROM = "MyTransporter <info@mytransporter.org>";
export const CONFIRMATION_REPLY_TO = "info@mytransporter.org";

export type ConfirmationInput = {
  reservationId: string;
  revision: number;
  customerName: string;
  customerEmail: string | null;
  vehicleName: string | null;
  vehiclePlate: string | null;
  startAt: string;
  endAt: string;
  totalPriceCents: number | null;
  pickupAddress: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidCustomerEmail(v: string | null | undefined): v is string {
  return typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v.trim());
}

/** Kurze, stabile Buchungskennung für Kunden (aus der Reservierungs-ID). */
export function bookingReference(reservationId: string): string {
  return `MT-${reservationId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/** Stabiler Idempotenz-Schlüssel je Reservierung + Revision + Mailtyp. */
export function confirmationIdempotencyKey(reservationId: string, revision: number): string {
  return `manual-customer-confirmation-${reservationId}-r${revision}`;
}

/** Fehlt etwas für eine vollständige Bestätigung? (Altbestand ohne Preis etc.) */
export function confirmationBlocker(i: ConfirmationInput): string | null {
  if (!isValidCustomerEmail(i.customerEmail)) return "Keine gültige Kunden-E-Mail hinterlegt";
  if (i.totalPriceCents == null) return "Kein Gesamtmietpreis hinterlegt – bitte erst nachtragen";
  if (!Number.isSafeInteger(i.totalPriceCents) || i.totalPriceCents < 0) return "Ungültiger Preis";
  if (!i.pickupAddress?.trim()) return "Kein Abholort hinterlegt";
  if (Number.isNaN(Date.parse(i.startAt)) || Number.isNaN(Date.parse(i.endAt))) return "Ungültiger Zeitraum";
  return null;
}

export function buildCustomerConfirmation(i: ConfirmationInput): {
  subject: string;
  html: string;
  text: string;
} {
  const ref = bookingReference(i.reservationId);
  const vehicle = [i.vehicleName, i.vehiclePlate].filter(Boolean).join(" · ") || "Transporter";
  const start = `${formatBerlin(i.startAt)} Uhr`;
  const end = `${formatBerlin(i.endAt)} Uhr`;
  const price = formatCents(i.totalPriceCents ?? 0);
  const pickup = i.pickupAddress ?? "";
  const name = i.customerName?.trim() || "";
  const greeting = name ? `Hallo ${name},` : "Hallo,";
  const subject = `MyTransporter · Buchungsbestätigung ${ref} · ${formatBerlin(i.startAt)}`;

  const rows: Array<[string, string]> = [
    ["Buchungskennung", ref],
    ["Name", name || "-"],
    ["Fahrzeug", vehicle],
    ["Beginn", start],
    ["Ende", end],
    ["Vereinbarter Gesamtmietpreis", price],
    ["Abholort", pickup],
  ];

  const text = [
    greeting,
    "",
    "hiermit bestätigen wir deine Buchung bei MyTransporter.",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Alle Zeiten in deutscher Ortszeit (Europe/Berlin).",
    "Bitte bring zur Abholung deinen Führerschein und Personalausweis mit.",
    "",
    `Fragen oder Änderungen? Antworte einfach auf diese E-Mail oder ruf uns an: ${BUSINESS.phoneDisplay}.`,
    "",
    "Viele Grüße",
    "Dein MyTransporter-Team",
    BUSINESS.email,
  ].join("\n");

  const tr = (k: string, v: string) =>
    `<tr><td style="padding:6px 0;color:#666;width:200px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:6px 0;"><strong>${escapeHtml(v)}</strong></td></tr>`;

  const html = `<!doctype html><html lang="de"><body style="margin:0;background:#ffffff;">
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:600px;margin:auto;padding:24px;color:#111;">
    <h2 style="margin:0 0 12px;">Deine Buchung ist bestätigt</h2>
    <p style="margin:0 0 8px;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px;">hiermit bestätigen wir deine Buchung bei MyTransporter.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows.map(([k, v]) => tr(k, v)).join("")}</table>
    <p style="font-size:12px;color:#666;margin:12px 0 0;">Alle Zeiten in deutscher Ortszeit (Europe/Berlin).</p>
    <p style="margin:16px 0 0;">Bitte bring zur Abholung deinen Führerschein und Personalausweis mit.</p>
    <p style="margin:16px 0 0;">Fragen oder Änderungen? Antworte einfach auf diese E-Mail oder ruf uns an:
      <a href="tel:${escapeHtml(BUSINESS.phone)}" style="color:#000;">${escapeHtml(BUSINESS.phoneDisplay)}</a>.</p>
    <p style="margin:24px 0 0;">Viele Grüße<br />Dein MyTransporter-Team<br />
      <a href="mailto:${escapeHtml(BUSINESS.email)}" style="color:#000;">${escapeHtml(BUSINESS.email)}</a></p>
  </div></body></html>`;

  return { subject, html, text };
}
