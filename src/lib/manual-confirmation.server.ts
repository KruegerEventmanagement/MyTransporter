/**
 * Versand der Kunden-Buchungsbestätigung für manuelle Termine.
 *
 * - Sendeabsicht wird atomar mit dem Speichern (manual_reservations.confirmation_requested)
 *   gesetzt; der Versuch läuft serverseitig im selben Speicher-Request.
 * - Je Reservierung+Revision genau eine Zeile mit EINGEFRORENEM Sendeinhalt
 *   (payload); Retries senden exakt denselben Inhalt unter demselben Schlüssel.
 * - Claim/Abschluss/Fehler über DB-Funktionen mit Fencing-Token. Vor dem externen
 *   Aufruf gilt der Versuch als „unklar“; nach Ablauf des sicheren
 *   Idempotenzfensters (23 h) wird ein unklarer Versuch NICHT wiederholt.
 * - Kein Trigger, kein Cron, kein Massen-Replay.
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

export type FrozenMail = {
  from: string;
  to: string;
  reply_to: string;
  subject: string;
  html: string;
  text: string;
};

export type CustomerMailRow = {
  id: string;
  reservation_id: string;
  revision: number;
  recipient_email: string;
  idempotency_key: string;
  status: "pending" | "processing" | "sent" | "failed";
  payload: FrozenMail | null;
};

export type ReservationForMail = ConfirmationInput & { confirmationRequested: boolean };

export type ClaimResult =
  | { result: "claimed"; lease_token: string; prior_ambiguous: boolean }
  | { result: "sent" | "in_progress" | "needs_review" | "no_payload" | "not_found" };

export type ConfirmationDeps = {
  loadReservation: (id: string) => Promise<ReservationForMail | null>;
  getRow: (reservationId: string, revision: number) => Promise<CustomerMailRow | null>;
  insertRow: (r: {
    reservation_id: string;
    revision: number;
    recipient_email: string;
    idempotency_key: string;
    payload: FrozenMail;
  }) => Promise<CustomerMailRow>;
  claim: (rowId: string) => Promise<ClaimResult>;
  complete: (rowId: string, leaseToken: string, providerId: string) => Promise<boolean>;
  fail: (rowId: string, leaseToken: string, kind: string, error: string, ambiguous: boolean) => Promise<boolean>;
  send: (mail: FrozenMail, idempotencyKey: string) => Promise<DetailedSendResult>;
};

export type ConfirmationOutcome =
  | { status: "sent"; already: boolean; revision: number }
  /** Anbieter hat angenommen, aber der Status konnte nicht gespeichert werden. */
  | { status: "accepted_unrecorded"; revision: number }
  | { status: "blocked"; reason: string }
  | { status: "in_progress"; revision: number }
  | { status: "needs_review"; revision: number }
  | { status: "failed"; kind: string; error: string; ambiguous: boolean; revision: number };

export const LEASE_SECONDS = 60;
export const SAFE_IDEMPOTENCY_SECONDS = 23 * 3600;

export function freezeMail(input: ConfirmationInput): FrozenMail {
  const m = buildCustomerConfirmation(input);
  return {
    from: CONFIRMATION_FROM,
    to: input.customerEmail!.trim(),
    reply_to: CONFIRMATION_REPLY_TO,
    subject: m.subject,
    html: m.html,
    text: m.text,
  };
}

/**
 * Versucht die Bestätigung für GENAU diese Revision zu senden. Eine neuere
 * Fassung wird nie stillschweigend statt der adressierten gesendet.
 */
export async function runCustomerConfirmation(
  deps: ConfirmationDeps,
  target: { reservationId: string; revision: number },
): Promise<ConfirmationOutcome> {
  const { reservationId, revision } = target;
  let row = await deps.getRow(reservationId, revision);

  if (!row) {
    const res = await deps.loadReservation(reservationId);
    if (!res) return { status: "blocked", reason: "Reservierung nicht gefunden" };
    if (res.revision !== revision) {
      return { status: "blocked", reason: "Diese Fassung ist nicht mehr aktuell – bitte neu speichern" };
    }
    if (!res.confirmationRequested) {
      return { status: "blocked", reason: "Für diese Fassung wurde keine Bestätigung angefordert" };
    }
    const blocker = confirmationBlocker(res);
    if (blocker) return { status: "blocked", reason: blocker };
    row = await deps.insertRow({
      reservation_id: reservationId,
      revision,
      recipient_email: res.customerEmail!.trim(),
      idempotency_key: confirmationIdempotencyKey(reservationId, revision),
      payload: freezeMail(res),
    });
  }
  if (!row.payload) return { status: "blocked", reason: "Kein eingefrorener Mailinhalt" };

  const claim = await deps.claim(row.id);
  if (claim.result === "sent") return { status: "sent", already: true, revision };
  if (claim.result === "in_progress") return { status: "in_progress", revision };
  if (claim.result === "needs_review") return { status: "needs_review", revision };
  if (claim.result !== "claimed") return { status: "blocked", reason: `Versand nicht möglich (${claim.result})` };

  const token = claim.lease_token;
  let result: DetailedSendResult;
  try {
    result = await deps.send(row.payload, row.idempotency_key);
  } catch (e) {
    result = {
      ok: false,
      kind: "network",
      ambiguous: true,
      status: null,
      error: String((e as Error)?.message ?? e).slice(0, 300),
    };
  }

  const providerOk = result.ok && typeof result.providerId === "string" && result.providerId.trim() !== "";
  if (providerOk && result.ok) {
    let recorded = false;
    try {
      recorded = await deps.complete(row.id, token, result.providerId);
    } catch {
      recorded = false;
    }
    // Angenommen ist angenommen – auch wenn der Status nicht gespeichert wurde.
    return recorded ? { status: "sent", already: false, revision } : { status: "accepted_unrecorded", revision };
  }

  const fail = result.ok
    ? { kind: "no_provider_id", error: "Antwort ohne Versand-ID", ambiguous: true }
    : { kind: result.kind, error: result.error, ambiguous: result.ambiguous };
  const ambiguous = fail.ambiguous || claim.prior_ambiguous;
  try {
    await deps.fail(row.id, token, fail.kind, fail.error, ambiguous);
  } catch {
    /* Zeile bleibt „processing/unklar“ und wird nach Lease-Ablauf kontrolliert geprüft */
  }
  return { status: "failed", kind: fail.kind, error: fail.error, ambiguous, revision };
}

export async function createConfirmationDeps(): Promise<ConfirmationDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendEmailDetailed } = await import("@/lib/booking-emails.server");
  const T = "manual_reservation_customer_mails";
  const COLS = "id, reservation_id, revision, recipient_email, idempotency_key, status, payload";

  const getRow = async (reservationId: string, revision: number) => {
    const { data, error } = await supabaseAdmin
      .from(T)
      .select(COLS)
      .eq("reservation_id", reservationId)
      .eq("revision", revision)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as unknown as CustomerMailRow) ?? null;
  };

  return {
    loadReservation: async (id) => {
      const { data, error } = await supabaseAdmin
        .from("manual_reservations")
        .select(
          "id, revision, customer_name, customer_email, vehicle_name, vehicle_plate, start_at, end_at, total_price_cents, pickup_address, confirmation_requested",
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
        confirmationRequested: data.confirmation_requested,
      };
    },
    getRow,
    insertRow: async (r) => {
      const { error } = await supabaseAdmin
        .from(T)
        .upsert(r as never, { onConflict: "reservation_id,revision", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      const row = await getRow(r.reservation_id, r.revision);
      if (!row) throw new Error("Versandeintrag nicht gefunden");
      return row;
    },
    claim: async (rowId) => {
      const { data, error } = await supabaseAdmin.rpc("claim_customer_confirmation", {
        _id: rowId,
        _lease_seconds: LEASE_SECONDS,
        _safe_seconds: SAFE_IDEMPOTENCY_SECONDS,
      });
      if (error) throw new Error(error.message);
      return data as unknown as ClaimResult;
    },
    complete: async (rowId, leaseToken, providerId) => {
      const { data, error } = await supabaseAdmin.rpc("complete_customer_confirmation", {
        _id: rowId,
        _lease_token: leaseToken,
        _provider_id: providerId,
      });
      if (error) throw new Error(error.message);
      return data === true;
    },
    fail: async (rowId, leaseToken, kind, err, ambiguous) => {
      const { data, error } = await supabaseAdmin.rpc("fail_customer_confirmation", {
        _id: rowId,
        _lease_token: leaseToken,
        _kind: kind,
        _error: err,
        _ambiguous: ambiguous,
      });
      if (error) throw new Error(error.message);
      return data === true;
    },
    send: (mail, key) =>
      sendEmailDetailed({
        from: mail.from,
        to: mail.to,
        replyTo: mail.reply_to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        idempotencyKey: key,
        timeoutMs: 15_000,
      }),
  };
}
