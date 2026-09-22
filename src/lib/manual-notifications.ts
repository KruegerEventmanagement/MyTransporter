/**
 * Owner-Benachrichtigungen für manuelle Termine (Kalender-Brücke).
 *
 * Reine Funktionen: Datenauszug säubern, Berliner Zeit formatieren (DST-sicher),
 * Betreff/HTML bauen. Der Versand selbst liegt in `manual-notifications.server.ts`.
 *
 * WICHTIG: In diese Mails dürfen NIEMALS Geburtsdatum, Ausweis-/Führerscheinnummern,
 * Adressdaten, Dokumente oder Abhol-/Zugangscodes gelangen.
 */

export const OWNER_CALENDAR_EMAIL = "info@mytransporter.org";

export const MANUAL_SOURCE_TYPE = "manual_reservation";
export const ONLINE_SOURCE_TYPE = "online_booking";

export const LABEL_RESERVATION_ID = "MyTransporter-Reservation-ID";
export const LABEL_BOOKING_ID = "MyTransporter-Booking-ID";
export const LABEL_SOURCE_TYPE = "MyTransporter-Source-Type";
export const LABEL_REVISION = "MyTransporter-Revision";
export const LABEL_EVENT = "MyTransporter-Event";

export type ManualNotificationEventKind = "created" | "updated" | "deleted";

/** Ausschließlich diese Felder dürfen den Server verlassen. */
export const ALLOWED_PAYLOAD_KEYS = [
  "reservation_id",
  "source_type",
  "revision",
  "event_kind",
  "vehicle_id",
  "vehicle_plate",
  "vehicle_name",
  "start_at",
  "end_at",
  "customer_name",
  "customer_phone",
  "customer_email",
  "note",
  "created_at",
  "updated_at",
] as const;

export type ManualNotificationPayload = {
  reservation_id: string;
  source_type: string;
  revision: number;
  event_kind?: string;
  vehicle_id?: string | null;
  vehicle_plate?: string | null;
  vehicle_name?: string | null;
  start_at: string;
  end_at: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/** Entfernt alle nicht freigegebenen (insbesondere sensiblen) Felder. */
export function sanitizeManualPayload(raw: unknown): ManualNotificationPayload {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_PAYLOAD_KEYS) {
    if (src[key] !== undefined) out[key] = src[key];
  }
  if (typeof out.reservation_id !== "string" || !out.reservation_id) {
    throw new Error("reservation_id fehlt im Benachrichtigungs-Datenauszug");
  }
  if (typeof out.start_at !== "string" || typeof out.end_at !== "string") {
    throw new Error("Zeitraum fehlt im Benachrichtigungs-Datenauszug");
  }
  out.source_type = MANUAL_SOURCE_TYPE;
  out.revision = Number(out.revision ?? 1);
  out.customer_name = typeof out.customer_name === "string" ? out.customer_name : "Unbekannt";
  return out as ManualNotificationPayload;
}

const berlinFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ISO-Zeitpunkt → "18.09.2026, 14:00" in Europe/Berlin (Sommer-/Winterzeit korrekt). */
export function formatBerlin(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return berlinFormatter.format(d);
}

/** Nur das Datum (für den Betreff). */
export function formatBerlinShort(iso: string): string {
  return formatBerlin(iso).replace(", ", " ");
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SUBJECT_PREFIX: Record<ManualNotificationEventKind, string> = {
  created: "🚐 Neue Buchung",
  updated: "🚐 Buchung geändert",
  deleted: "🚐 Buchung storniert",
};

export function manualNotificationSubject(
  eventKind: ManualNotificationEventKind,
  payload: ManualNotificationPayload,
): string {
  return `${SUBJECT_PREFIX[eventKind]} · ${payload.customer_name} · ${formatBerlinShort(payload.start_at)}`;
}

/** Kurzfassung für den Handy-Push (keine sensiblen Daten). */
export function manualPushSummary(
  eventKind: ManualNotificationEventKind,
  payload: ManualNotificationPayload,
): { title: string; body: string } {
  const title =
    eventKind === "created"
      ? "Neuer Termin (manuell)"
      : eventKind === "updated"
        ? "Termin geändert"
        : "Termin storniert";
  const vehicle = [payload.vehicle_name, payload.vehicle_plate].filter(Boolean).join(" · ");
  return {
    title,
    body: `${payload.customer_name}${vehicle ? ` · ${vehicle}` : ""} · ${formatBerlin(payload.start_at)}`,
  };
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:#666;width:210px;">${escapeHtml(label)}</td><td>${value}</td></tr>`;
}

/**
 * Baut die Owner-Mail. Enthält sowohl menschlich lesbare Berliner Zeiten als
 * auch explizite ISO-Zeitstempel und stabile Kennungen zur Deduplizierung.
 */
export function buildManualNotificationEmail(args: {
  eventKind: ManualNotificationEventKind;
  payload: ManualNotificationPayload;
}): { subject: string; html: string } {
  const { eventKind, payload } = args;
  const subject = manualNotificationSubject(eventKind, payload);
  const heading = SUBJECT_PREFIX[eventKind];
  const vehicle =
    [payload.vehicle_name, payload.vehicle_plate].filter(Boolean).map(String).join(" · ") || "-";

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:auto;padding:24px;color:#111;">
    <h2 style="margin:0 0 16px;">${escapeHtml(heading)}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${row("Kunde", `<strong>${escapeHtml(payload.customer_name)}</strong>`)}
      ${row("Telefon", escapeHtml(payload.customer_phone ?? "-"))}
      ${row("E-Mail", escapeHtml(payload.customer_email ?? "-"))}
      ${row("Fahrzeug", escapeHtml(vehicle))}
      ${row("Beginn (Europe/Berlin)", `<strong>${escapeHtml(formatBerlin(payload.start_at))} Uhr</strong>`)}
      ${row("Ende (Europe/Berlin)", `<strong>${escapeHtml(formatBerlin(payload.end_at))} Uhr</strong>`)}
      ${row("Beginn (ISO)", `<code>${escapeHtml(payload.start_at)}</code>`)}
      ${row("Ende (ISO)", `<code>${escapeHtml(payload.end_at)}</code>`)}
      ${row("Notiz", escapeHtml(payload.note ?? "-"))}
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:12px;color:#666;margin-top:20px;">
      ${row(LABEL_SOURCE_TYPE, escapeHtml(MANUAL_SOURCE_TYPE))}
      ${row(LABEL_RESERVATION_ID, `<code>${escapeHtml(payload.reservation_id)}</code>`)}
      ${row(LABEL_EVENT, escapeHtml(eventKind))}
      ${row(LABEL_REVISION, escapeHtml(String(payload.revision)))}
      ${row("Revisionszeitpunkt", `<code>${escapeHtml(payload.updated_at ?? payload.created_at ?? "-")}</code>`)}
    </table>
    <p style="margin:24px 0;">
      <a href="https://www.mytransporter.org/admin?tab=calendar" style="background:#000;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Im Admin öffnen</a>
    </p>
  </div>`;

  return { subject, html };
}

/** Stabiler Schlüssel pro Ereignis – verhindert Doppelversand bei Wiederholungen. */
export function manualNotificationIdempotencyKey(
  reservationId: string,
  eventKind: ManualNotificationEventKind,
  revision: number,
): string {
  return `manual-res-${reservationId}-${eventKind}-${revision}`;
}
