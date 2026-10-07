/**
 * Versand der Kunden-Buchungsbestätigung für manuelle Termine.
 *
 * Getrennt von der Owner-Benachrichtigung (manual_reservation_notifications):
 * eigener Status je Reservierung+Revision in manual_reservation_customer_mails.
 * Wird NUR ausdrücklich vom Admin ausgelöst (nach erfolgreichem Speichern bzw.
 * per „Erneut senden“) – kein Trigger, kein Cron, kein Massen-Replay.
 *
 * Idempotenz: eindeutige Zeile (reservation_id, revision), optimistischer Claim
 * über attempts + Lease, stabiler Resend-Idempotency-Key. Nach 23 h ist der
 * Resend-Schlüssel nicht mehr verlässlich – unklare Altversuche werden dann
 * NICHT automatisch wiederholt.
 */
import {
  buildCustomerConfirmation,
  confirmationBlocker,
  confirmationIdempotencyKey,
  CONFIRMATION_FROM,
  CONFIRMATION_REPLY_TO,
  type ConfirmationInput,
} from "@/lib/manual-confirmation";
import type { DetailedSendResult } from "@/lib/booking-emails.server";

export type CustomerMailRow = {
  id: string;
  reservation_id: string;
  revision: number;
  recipient_email: string;
  idempotency_key: string;
  status: "pending" | "processing" | "sent" | "failed";
  attempts: number;
  ambiguous: boolean;
  error_kind: string | null;
  last_error: string | null;
  provider_message_id: string | null;
  first_attempt_at: string | null;
  lease_until: string | null;
  sent_at: string | null;
};

export type ConfirmationDeps = {
  loadReservation: (id: string) => Promise<ConfirmationInput | null>;
  ensureRow: (r: {
    reservation_id: string;
    revision: number;
    recipient_email: string;
    idempotency_key: string;
  }) => Promise<CustomerMailRow>;
  claim: (row: CustomerMailRow, nowIso: string, leaseUntilIso: string) => Promise<boolean>;
  markSent: (id: string, providerId: string, nowIso: string) => Promise<void>;
  markFailed: (id: string, kind: string, error: string, ambiguous: boolean) => Promise<void>;
  send: (args: {
    from: string;
    to: string;
    replyTo: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
  }) => Promise<DetailedSendResult>;
  now?: () => number;
};

export type ConfirmationOutcome =
  | { status: "sent"; already: boolean; providerId: string | null; revision: number }
  | { status: "blocked"; reason: string }
  | { status: "in_progress" }
  | { status: "failed"; kind: string; error: string; ambiguous: boolean; revision: number };

const LEASE_MS = 60_000;
const IDEMPOTENCY_SAFE_MS = 23 * 3600_000;

export async function runCustomerConfirmation(
  deps: ConfirmationDeps,
  reservationId: string,
): Promise<ConfirmationOutcome> {
  const now = deps.now ?? Date.now;
  const input = await deps.loadReservation(reservationId);
  if (!input) return { status: "blocked", reason: "Reservierung nicht gefunden" };
  const blocker = confirmationBlocker(input);
  if (blocker) return { status: "blocked", reason: blocker };

  const key = confirmationIdempotencyKey(input.reservationId, input.revision);
  const row = await deps.ensureRow({
    reservation_id: input.reservationId,
    revision: input.revision,
    recipient_email: input.customerEmail!.trim(),
    idempotency_key: key,
  });

  if (row.status === "sent") {
    return { status: "sent", already: true, providerId: row.provider_message_id, revision: row.revision };
  }
  if (
    row.ambiguous &&
    row.first_attempt_at &&
    now() - Date.parse(row.first_attempt_at) > IDEMPOTENCY_SAFE_MS
  ) {
    return {
      status: "blocked",
      reason:
        "Früherer Versuch ist unklar und älter als 23 Stunden – bitte im Postfach prüfen, statt blind erneut zu senden",
    };
  }

  const nowIso = new Date(now()).toISOString();
  const claimed = await deps.claim(row, nowIso, new Date(now() + LEASE_MS).toISOString());
  if (!claimed) return { status: "in_progress" };

  const mail = buildCustomerConfirmation(input);
  const result = await deps.send({
    from: CONFIRMATION_FROM,
    to: row.recipient_email,
    replyTo: CONFIRMATION_REPLY_TO,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    idempotencyKey: row.idempotency_key,
  });

  if (result.ok) {
    await deps.markSent(row.id, result.providerId, new Date(now()).toISOString());
    return { status: "sent", already: false, providerId: result.providerId, revision: row.revision };
  }
  await deps.markFailed(row.id, result.kind, result.error, result.ambiguous || row.ambiguous);
  return {
    status: "failed",
    kind: result.kind,
    error: result.error,
    ambiguous: result.ambiguous,
    revision: row.revision,
  };
}

export async function createConfirmationDeps(): Promise<ConfirmationDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendEmailDetailed } = await import("@/lib/booking-emails.server");
  const T = "manual_reservation_customer_mails";
  const COLS =
    "id, reservation_id, revision, recipient_email, idempotency_key, status, attempts, ambiguous, error_kind, last_error, provider_message_id, first_attempt_at, lease_until, sent_at";

  return {
    loadReservation: async (id) => {
      const { data, error } = await supabaseAdmin
        .from("manual_reservations")
        .select(
          "id, revision, customer_name, customer_email, vehicle_name, vehicle_plate, start_at, end_at, total_price_cents, pickup_address",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        reservationId: data.id,
        revision: data.revision,
        customerName: data.customer_name,
        customerEmail: data.customer_email,
        vehicleName: data.vehicle_name,
        vehiclePlate: data.vehicle_plate,
        startAt: data.start_at,
        endAt: data.end_at,
        totalPriceCents: data.total_price_cents,
        pickupAddress: data.pickup_address,
      };
    },
    ensureRow: async (r) => {
      const { error } = await supabaseAdmin
        .from(T)
        .upsert(r, { onConflict: "reservation_id,revision", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      const { data, error: e2 } = await supabaseAdmin
        .from(T)
        .select(COLS)
        .eq("reservation_id", r.reservation_id)
        .eq("revision", r.revision)
        .single();
      if (e2) throw new Error(e2.message);
      return data as CustomerMailRow;
    },
    claim: async (row, nowIso, leaseUntilIso) => {
      const { data, error } = await supabaseAdmin
        .from(T)
        .update({
          status: "processing",
          attempts: row.attempts + 1,
          lease_until: leaseUntilIso,
          first_attempt_at: row.first_attempt_at ?? nowIso,
        })
        .eq("id", row.id)
        .eq("attempts", row.attempts)
        .or(`status.in.(pending,failed),and(status.eq.processing,lease_until.lt.${nowIso})`)
        .select("id");
      if (error) throw new Error(error.message);
      return (data ?? []).length === 1;
    },
    markSent: async (id, providerId, nowIso) => {
      const { error } = await supabaseAdmin
        .from(T)
        .update({
          status: "sent",
          provider_message_id: providerId,
          sent_at: nowIso,
          lease_until: null,
          last_error: null,
          error_kind: null,
          ambiguous: false,
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    markFailed: async (id, kind, err, ambiguous) => {
      const { error } = await supabaseAdmin
        .from(T)
        .update({ status: "failed", error_kind: kind, last_error: err.slice(0, 500), ambiguous, lease_until: null })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    send: (args) => sendEmailDetailed({ ...args, timeoutMs: 15_000 }),
  };
}
