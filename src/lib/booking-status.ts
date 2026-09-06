/**
 * Buchungsstatus, die ein Fahrzeug blockieren.
 *
 * Spiegelt die zentrale DB-Funktion `public.blocking_booking_statuses()`.
 * Wird die Liste hier geändert, muss die DB-Funktion per Migration mit
 * angepasst werden (und umgekehrt).
 *
 * `returning` blockiert bewusst: Das Fahrzeug ist noch nicht endgültig
 * zurückgegeben. `cancelled`, `completed` und `refunded` blockieren nicht.
 */
export const BLOCKING_BOOKING_STATUSES = [
  "paid",
  "confirmed",
  "active",
  "started",
  "running",
  "in_progress",
  "picked_up",
  "returning",
  "return_pending",
] as const;

export type BlockingBookingStatus = (typeof BLOCKING_BOOKING_STATUSES)[number];
