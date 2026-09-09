/**
 * Action-/Outbox-State-Machine für die Folgeaktionen nach einer bezahlten Buchung.
 *
 * Garantien (DB-gestützt über public.booking_actions + claim/complete/fail):
 * - jede Aktion existiert pro Buchung genau einmal (Unique (booking_id, action_key))
 * - parallele Läufe (z. B. Stripe-Retries) führen eine Aktion nie doppelt aus
 * - eine fehlgeschlagene Aktion bleibt retrybar (kein stuck-state)
 * - eine erfolgreiche Aktion wird nie erneut ausgeführt
 */

export const BOOKING_ACTION_KEYS = [
  "new_booking_notification",
  "customer_confirmation_invoice",
  "admin_booking_email",
] as const;

export type BookingActionKey = (typeof BOOKING_ACTION_KEYS)[number];

export type BookingActionOutcome = "succeeded" | "skipped" | "failed";

export interface BookingActionStore {
  /** true ⇒ diese Ausführung darf die Aktion jetzt durchführen. */
  claim(bookingId: string, key: BookingActionKey): Promise<boolean>;
  complete(bookingId: string, key: BookingActionKey): Promise<void>;
  fail(bookingId: string, key: BookingActionKey, error: string): Promise<void>;
}

/** Jeder Handler MUSS bei Misserfolg werfen – nur dann bleibt die Aktion retrybar. */
export type BookingActionHandlers = Record<BookingActionKey, (bookingId: string) => Promise<void>>;

export interface ReconcileResult {
  bookingId: string;
  results: Record<BookingActionKey, BookingActionOutcome>;
  hasFailures: boolean;
}

/**
 * Reine, testbare Kernlogik. Aktionen laufen sequenziell, damit ein Fehler
 * die anderen nicht blockiert (jede Aktion hat ihren eigenen Zustand).
 */
export async function runBookingActions(
  bookingId: string,
  store: BookingActionStore,
  handlers: BookingActionHandlers,
  only?: readonly BookingActionKey[],
): Promise<ReconcileResult> {
  const keys = (only && only.length > 0 ? only : BOOKING_ACTION_KEYS) as readonly BookingActionKey[];
  const results = {} as Record<BookingActionKey, BookingActionOutcome>;
  for (const key of BOOKING_ACTION_KEYS) results[key] = "skipped";

  for (const key of keys) {
    let claimed = false;
    try {
      claimed = await store.claim(bookingId, key);
    } catch (e) {
      // Kein Claim möglich (DB-Problem): Aktion als fehlgeschlagen melden,
      // damit der Aufrufer retryen kann – aber nichts doppelt senden.
      results[key] = "failed";
      console.error(`[booking-actions] claim fehlgeschlagen (${key}, ${bookingId})`, e);
      continue;
    }
    if (!claimed) {
      results[key] = "skipped";
      continue;
    }
    try {
      await handlers[key](bookingId);
      await store.complete(bookingId, key);
      results[key] = "succeeded";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results[key] = "failed";
      try {
        await store.fail(bookingId, key, msg);
      } catch (inner) {
        console.error(`[booking-actions] fail-Update fehlgeschlagen (${key})`, inner);
      }
      console.error(`[booking-actions] ${key} fehlgeschlagen für ${bookingId}: ${msg}`);
    }
  }

  return {
    bookingId,
    results,
    hasFailures: Object.values(results).some((r) => r === "failed"),
  };
}

/** Supabase-gestützter Store (service_role, RLS-unabhängig). */
export function createSupabaseActionStore(
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
): BookingActionStore {
  return {
    async claim(bookingId, key) {
      const { data, error } = await supabase.rpc("claim_booking_action", {
        _booking_id: bookingId,
        _action_key: key,
      });
      if (error) throw new Error(`claim_booking_action: ${error.message}`);
      return data === true;
    },
    async complete(bookingId, key) {
      const { error } = await supabase.rpc("complete_booking_action", {
        _booking_id: bookingId,
        _action_key: key,
      });
      if (error) throw new Error(`complete_booking_action: ${error.message}`);
    },
    async fail(bookingId, key, message) {
      const { error } = await supabase.rpc("fail_booking_action", {
        _booking_id: bookingId,
        _action_key: key,
        _error: message,
      });
      if (error) console.warn(`[booking-actions] fail_booking_action: ${error.message}`);
    },
  };
}

/** Interne „Neue Buchung“-Meldung – genau einmal pro Buchung. */
async function createNewBookingNotification(bookingId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("id, user_id, plan_label, start_date, start_hour, pickup_code")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !booking) throw new Error(`Buchung ${bookingId} nicht gefunden`);

  const { error: insertError } = await supabaseAdmin.from("admin_notifications").insert({
    type: "booking_created",
    title: "Neue Buchung",
    body: `${booking.plan_label} · Start ${booking.start_date} ${String(booking.start_hour).padStart(2, "0")}:00 · Code ${booking.pickup_code}`,
    booking_id: booking.id,
    user_id: booking.user_id,
  });
  // Unique-Index (booking_id, title): bereits vorhanden ⇒ Ziel erreicht.
  if (insertError && insertError.code !== "23505" && !insertError.message.includes("duplicate key")) {
    throw new Error(insertError.message);
  }
}

/**
 * Holt alle fehlenden/fehlgeschlagenen Folgeaktionen einer bezahlten Buchung nach.
 * Idempotent und parallel-sicher; verändert weder Buchung noch Verfügbarkeit.
 */
export async function reconcileBookingPostActions(
  bookingId: string,
  only?: readonly BookingActionKey[],
): Promise<ReconcileResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendBookingConfirmationImpl, sendAdminBookingNotificationImpl } = await import(
    "@/lib/booking-emails.server"
  );

  const store = createSupabaseActionStore(
    supabaseAdmin as unknown as Parameters<typeof createSupabaseActionStore>[0],
  );

  return runBookingActions(
    bookingId,
    store,
    {
      new_booking_notification: createNewBookingNotification,
      customer_confirmation_invoice: async (id) => {
        const res = await sendBookingConfirmationImpl({ bookingId: id });
        if (!res.sent) throw new Error(`Kundenbestätigung nicht versendet (${res.reason ?? "unbekannt"})`);
      },
      admin_booking_email: async (id) => {
        const res = await sendAdminBookingNotificationImpl({ bookingId: id });
        if (!res.sent) throw new Error(`Admin-Buchungsmail nicht versendet (${res.reason ?? "unbekannt"})`);
      },
    },
    only,
  );
}
