/**
 * Reine Logik der Google-Kalender-Synchronisierung.
 *
 * Ein Mietzeitraum wird als privater Termin ohne Teilnehmer im Hauptkalender
 * info@mytransporter.org geführt. Je Quelle (Buchung / manueller Termin) gibt
 * es genau einen Zustand mit Version; der Worker liest vor jedem externen
 * Schreiben den AKTUELLEN Datenbankstand, damit alte Aufträge nie einen
 * neueren Stand (z. B. Storno) überholen.
 *
 * WICHTIG: Keine Geburtsdaten, Ausweis-/Führerscheindaten, Dokumente,
 * Abhol-/Zugangscodes, Kontaktdaten oder Freitextnotizen übertragen.
 */

export const CALENDAR_ID = "info@mytransporter.org";
export const CALENDAR_TIME_ZONE = "Europe/Berlin";

/** Erinnerungen wie vereinbart (Minuten vor Abholung). */
export const REMINDER_MINUTES = [10080, 4320, 360, 180, 60] as const;

export type CalendarSourceType = "booking" | "manual_reservation";
export type CalendarAction = "upsert" | "delete" | "noop";

/** Zustand je Quelle aus `calendar_sync_state` (per Lease beansprucht). */
export type CalendarSourceState = {
  source_type: string;
  source_id: string;
  version: number;
  synced_version: number;
  google_event_id: string | null;
  attempts: number;
  lease_token: string | null;
};

export type CalendarEventBody = {
  id: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  visibility: "private";
  transparency: "opaque";
  guestsCanInviteOthers: false;
  attendees: [];
  reminders: { useDefault: false; overrides: { method: "popup"; minutes: number }[] };
  extendedProperties: { private: Record<string, string> };
};

/** Status, bei denen die Miete stattfindet bzw. stattgefunden hat. */
const ACTIVE_BOOKING = new Set([
  "paid", "confirmed", "active", "started", "running",
  "in_progress", "picked_up", "returning", "return_pending",
]);
/** Abgeschlossene Mieten bleiben als Historie im Kalender. */
const HISTORY_BOOKING = new Set(["completed", "returned", "finished"]);
/** Nur ausdrückliche Stornos entfernen den Termin. */
const CANCELLED_BOOKING = new Set(["cancelled", "canceled"]);

/**
 * Entscheidet anhand des AKTUELLEN Datenbankstands.
 * - Buchung aktiv/bezahlt → anlegen/aktualisieren
 * - Buchung storniert → löschen
 * - abgeschlossen → unverändert lassen (Historie)
 * - unbezahlt/fehlgeschlagen/unbekannt → nichts tun
 * - manueller Termin vorhanden → anlegen/aktualisieren, gelöscht → löschen
 */
export function decideCalendarAction(
  sourceType: CalendarSourceType,
  snapshot: Record<string, unknown> | null,
): CalendarAction {
  if (sourceType === "manual_reservation") return snapshot ? "upsert" : "delete";
  if (!snapshot) return "noop"; // Buchungen werden nie gelöscht – kein Rückschluss
  const status = String(snapshot.status ?? "").toLowerCase();
  if (ACTIVE_BOOKING.has(status)) return "upsert";
  if (CANCELLED_BOOKING.has(status)) return "delete";
  if (HISTORY_BOOKING.has(status)) return "noop";
  return "noop";
}

/**
 * Google erlaubt als Termin-Kennung base32hex (a–v, 0–9), 5–1024 Zeichen.
 */
export function calendarEventId(sourceType: CalendarSourceType, sourceId: string): string {
  const hex = sourceId.replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (hex.length < 8) throw new Error("Quell-Kennung für Kalendertermin unbrauchbar");
  return `${sourceType === "booking" ? "mtb" : "mtm"}${hex}`;
}

export function sourceIdLabel(sourceType: CalendarSourceType): string {
  return sourceType === "booking" ? "MyTransporter-Booking-ID" : "MyTransporter-Reservation-ID";
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Exakte ID-Prüfung: nur `Label: <uuid>` mit identischer UUID zählt. */
export function descriptionMatchesSource(
  description: string | null | undefined,
  sourceType: CalendarSourceType,
  sourceId: string,
): boolean {
  if (!description) return false;
  const label = sourceIdLabel(sourceType);
  const re = new RegExp(`${label}\\s*:\\s*(${UUID_RE.source})(?![0-9a-z-])`, "gi");
  for (const m of description.matchAll(re)) {
    if (m[1].toLowerCase() === sourceId.toLowerCase()) return true;
  }
  return false;
}

function requireIso(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} fehlt oder ist unlesbar`);
  }
  return value;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Baut den Kalendertermin aus dem sicheren Datenauszug (Whitelist). */
export function buildCalendarEvent(
  sourceType: CalendarSourceType,
  sourceId: string,
  payload: unknown,
): CalendarEventBody {
  const p = (payload ?? {}) as Record<string, unknown>;
  const start = requireIso(p.start_at, "Beginn");
  const end = requireIso(p.end_at, "Ende");
  if (Date.parse(end) <= Date.parse(start)) throw new Error("Ende liegt nicht nach dem Beginn");

  const plate = str(p.vehicle_plate);
  const vehicle = str(p.vehicle_name);
  const customer = str(p.customer_name);
  const isBooking = sourceType === "booking";
  const plan = isBooking ? str(p.plan_label) : null;

  const lines = [
    `Fahrzeug: ${vehicle ?? plate ?? "Transporter"}${vehicle && plate ? ` (${plate})` : ""}`,
    customer ? `Kunde: ${customer}` : null,
    plan ? `Tarif: ${plan}` : null,
    `Quelle: ${isBooking ? "Online-Buchung" : "Manueller Termin"}`,
    `${sourceIdLabel(sourceType)}: ${sourceId}`,
  ].filter(Boolean);

  return {
    id: calendarEventId(sourceType, sourceId),
    summary: ["MyTransporter", plate ?? vehicle ?? "Transporter", customer ?? (isBooking ? "Online-Buchung" : "Manueller Termin")].join(" · "),
    description: lines.join("\n"),
    start: { dateTime: start, timeZone: CALENDAR_TIME_ZONE },
    end: { dateTime: end, timeZone: CALENDAR_TIME_ZONE },
    visibility: "private",
    transparency: "opaque",
    guestsCanInviteOthers: false,
    attendees: [],
    reminders: {
      useDefault: false,
      overrides: REMINDER_MINUTES.map((minutes) => ({ method: "popup" as const, minutes })),
    },
    extendedProperties: { private: { mt_source_type: sourceType, mt_source_id: sourceId } },
  };
}

/** Wiederholungsabstand: wächst mit den Versuchen, maximal eine Stunde. */
export function calendarBackoffSeconds(attempts: number): number {
  return Math.min(Math.max(attempts, 1) * 300, 3600);
}
