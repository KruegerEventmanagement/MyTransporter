/**
 * Aufbewahrungsregel für Ausweis-/Führerscheinkopien, die ein Kunde aus seinem
 * Konto entfernt. Grundlage ist die Datenschutzerklärung: Löschung 90 Tage
 * nach Vertragsende. Ohne betroffenen Mietvertrag oder nach Fristablauf wird
 * die Kopie sofort gelöscht – keine pauschale oder unbefristete Aufbewahrung.
 */
import { BLOCKING_BOOKING_STATUSES } from "./booking-status";
import { resolveTripWindow } from "./trip-time";

export const DOC_GROUPS = {
  id: ["id_front", "id_back"],
  license: ["license_front", "license_back"],
} as const;
export type DocGroup = keyof typeof DOC_GROUPS;
export const ALL_IDENTITY_DOC_TYPES = [...DOC_GROUPS.id, ...DOC_GROUPS.license];

export const RETENTION_DAYS_AFTER_CONTRACT = 90;
const DAY = 86_400_000;

/** Status, die einen (geschlossenen) Mietvertrag bedeuten. */
const CONTRACT_STATUSES = new Set<string>([...BLOCKING_BOOKING_STATUSES, "completed"]);

export interface RetentionBooking {
  id: string;
  status: string | null;
  start_date: string;
  start_hour: number | null;
  plan_id: string | null;
}

export type RetentionDecision =
  | { action: "archive"; untilMs: number; reason: string; bookingId: string }
  | { action: "delete"; reason: string };

export function computeRetention(
  docCreatedAtMs: number,
  bookings: RetentionBooking[],
  nowMs: number,
): RetentionDecision {
  let best: { endMs: number; id: string } | null = null;
  for (const b of bookings) {
    if (!b.start_date || !CONTRACT_STATUSES.has(String(b.status))) continue;
    const { endMs } = resolveTripWindow(b);
    // Nur Verträge, für die das Dokument vorlag (Dokument vor Vertragsende hochgeladen).
    if (!Number.isFinite(endMs) || endMs < docCreatedAtMs) continue;
    if (!best || endMs > best.endMs) best = { endMs, id: b.id };
  }
  if (!best) return { action: "delete", reason: "Kein Mietvertrag, für den das Dokument benötigt wird" };
  const untilMs = best.endMs + RETENTION_DAYS_AFTER_CONTRACT * DAY;
  if (untilMs <= nowMs) {
    return { action: "delete", reason: "Frist 90 Tage nach Vertragsende bereits abgelaufen" };
  }
  return {
    action: "archive",
    untilMs,
    bookingId: best.id,
    reason: `Identitätsnachweis zum Mietvertrag ${best.id.slice(0, 8)}; Löschung 90 Tage nach Vertragsende (Datenschutzerklärung)`,
  };
}
