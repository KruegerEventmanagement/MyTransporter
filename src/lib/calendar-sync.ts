/**
 * Reine Logik der Google-Kalender-Synchronisierung.
 *
 * Ein Mietzeitraum wird als echter Kalendertermin im Hauptkalender
 * info@mytransporter.org geführt. Die Termin-Kennung wird deterministisch aus
 * der Quell-Kennung gebildet – dadurch erzeugen Wiederholungen niemals
 * Dubletten, und Änderungen/Stornos treffen exakt denselben Termin.
 *
 * WICHTIG: Keine Geburtsdaten, Ausweis-/Führerscheindaten, Dokumente,
 * Abhol-/Zugangscodes oder Freitextnotizen in Kalendertermine übertragen.
 */

export const CALENDAR_ID = "info@mytransporter.org";
export const CALENDAR_TIME_ZONE = "Europe/Berlin";

/** Erinnerungen wie vereinbart (Minuten vor Abholung). */
export const REMINDER_MINUTES = [10080, 4320, 360, 180, 60] as const;

export type CalendarSourceType = "booking" | "manual_reservation";
export type CalendarEventKind = "upsert" | "delete";

export type CalendarJob = {
  id: string;
  source_type: string;
  source_id: string;
  event_kind: string;
  payload: unknown;
  attempts: number;
  lease_token?: string | null;
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
  reminders: { useDefault: false; overrides: { method: "popup"; minutes: number }[] };
  extendedProperties: { private: Record<string, string> };
};

/**
 * Google erlaubt als Termin-Kennung base32hex (Zeichen a–v und 0–9), 5–1024
 * Zeichen. Hex-Zeichen einer UUID erfüllen das; das Präfix trennt die Quellen.
 */
export function calendarEventId(sourceType: CalendarSourceType, sourceId: string): string {
  const hex = sourceId.replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (hex.length < 8) throw new Error("Quell-Kennung für Kalendertermin unbrauchbar");
  return `${sourceType === "booking" ? "mtb" : "mtm"}${hex}`;
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

/** Baut den Kalendertermin aus dem sicheren Datenauszug der Warteschlange. */
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
  const vehicle = str(p.vehicle_name) ?? plate ?? "Transporter";
  const isBooking = sourceType === "booking";
  const who = isBooking ? "Online-Buchung" : (str(p.customer_name) ?? "Manuelle Reservierung");
  const plan = str(p.plan_label);

  const lines = [
    `Fahrzeug: ${vehicle}${plate ? ` (${plate})` : ""}`,
    plan ? `Tarif: ${plan}` : null,
    isBooking ? null : str(p.customer_name) ? `Kunde: ${str(p.customer_name)}` : null,
    isBooking ? null : str(p.customer_phone) ? `Telefon: ${str(p.customer_phone)}` : null,
    `Quelle: ${isBooking ? "Online-Buchung" : "Manueller Termin"}`,
    `${isBooking ? "MyTransporter-Booking-ID" : "MyTransporter-Reservation-ID"}: ${sourceId}`,
  ].filter(Boolean);

  return {
    id: calendarEventId(sourceType, sourceId),
    summary: `${vehicle}${plate ? ` · ${plate}` : ""} · ${who}`,
    description: lines.join("\n"),
    start: { dateTime: start, timeZone: CALENDAR_TIME_ZONE },
    end: { dateTime: end, timeZone: CALENDAR_TIME_ZONE },
    visibility: "private",
    transparency: "opaque",
    guestsCanInviteOthers: false,
    reminders: {
      useDefault: false,
      overrides: REMINDER_MINUTES.map((minutes) => ({ method: "popup" as const, minutes })),
    },
    extendedProperties: {
      private: {
        mt_source_type: sourceType,
        mt_source_id: sourceId,
      },
    },
  };
}

/** Wiederholungsabstand: wächst mit den Versuchen, maximal eine Stunde. */
export function calendarBackoffSeconds(attempts: number): number {
  return Math.min(Math.max(attempts, 1) * 300, 3600);
}
