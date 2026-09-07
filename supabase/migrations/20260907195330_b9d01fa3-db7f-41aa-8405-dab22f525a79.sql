-- Exactly-once: eine Zahlung => maximal eine Buchung
CREATE UNIQUE INDEX IF NOT EXISTS bookings_stripe_payment_intent_uniq
  ON public.bookings (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Exactly-once: Folgeaktionen pro Buchung nur einmal protokollieren
CREATE UNIQUE INDEX IF NOT EXISTS admin_notifications_booking_action_uniq
  ON public.admin_notifications (booking_id, title)
  WHERE booking_id IS NOT NULL
    AND title IN ('Neue Buchung', 'Buchungsbestaetigung versendet', 'Admin-Buchungsmail versendet');

-- Performance für Verfügbarkeits-/Kalenderabfragen (fahrzeugbezogen)
CREATE INDEX IF NOT EXISTS bookings_plate_start_idx
  ON public.bookings (public.normalize_plate(vehicle_plate), start_date);

CREATE INDEX IF NOT EXISTS booking_holds_expires_idx
  ON public.booking_holds (expires_at);

CREATE INDEX IF NOT EXISTS manual_reservations_plate_start_idx
  ON public.manual_reservations (public.normalize_plate(vehicle_plate), start_at);

CREATE INDEX IF NOT EXISTS vehicle_blocks_plate_start_idx
  ON public.vehicle_blocks (public.normalize_plate(vehicle_plate), start_at);
