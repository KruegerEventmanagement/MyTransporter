import { processOutboxRow, type FrozenOutboxMail, type OutboxRow } from "@/lib/customer-mail-outbox";
import type { ReservationForMail } from "@/lib/manual-confirmation.server";

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function loadBookingEmailSnapshot(id: string) {
  const store = await db();
  const { data, error } = await store.from("booking_email_intents").select("snapshot")
    .eq("source_type", "booking").eq("source_id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.snapshot as Record<string, unknown> | undefined;
}

/** The provider-facing payload/key live in the fenced outbox, never in browser state. */
export async function sendDurableBookingMail(id: string, kind: "booking_confirmation" | "admin_booking", mail: FrozenOutboxMail): Promise<{ sent: boolean; reason?: string }> {
  const store = await db();
  const { createOutboxDeps } = await import("@/lib/customer-mail-outbox.server");
  // Preserve the old provider keys: a deployment within the provider window cannot duplicate an old attempt.
  const key = kind === "booking_confirmation" ? `booking-confirmation-${id}` : `admin-booking-${id}`;
  const { error } = await store.from("customer_mail_outbox").upsert({
    source_type: "booking", source_id: id, kind, due_at: new Date().toISOString(),
    recipient_email: mail.to, payload: mail as never, idempotency_key: key,
  }, { onConflict: "source_type,source_id,kind", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  const { data, error: readError } = await store.from("customer_mail_outbox").select("*")
    .eq("source_type", "booking").eq("source_id", id).eq("kind", kind).single();
  if (readError) throw new Error(readError.message);
  const result = await processOutboxRow(await createOutboxDeps(), data as unknown as OutboxRow);
  if (result.status === "failed") throw new Error(`${result.kind}: ${result.error}`);
  // An unrecorded acceptance must be reconciled with the SAME provider key, not marked final upstream.
  if (result.status === "sent" || (result.status === "skipped" && result.reason === "sent")) return { sent: true };
  return { sent: false, reason: result.status === "skipped" ? result.reason : result.status === "cancelled" ? "cancelled" : result.status };
}

export function manualIntentSnapshot(s: Record<string, unknown>): ReservationForMail {
  return {
    reservationId: String(s.id), revision: Number(s.revision), customerName: String(s.customer_name ?? ""),
    customerEmail: typeof s.customer_email === "string" ? s.customer_email : null,
    vehicleName: typeof s.vehicle_name === "string" ? s.vehicle_name : null,
    vehiclePlate: typeof s.vehicle_plate === "string" ? s.vehicle_plate : null,
    startAt: String(s.start_at), endAt: String(s.end_at),
    totalPriceCents: typeof s.total_price_cents === "number" ? s.total_price_cents : null,
    pickupAddress: typeof s.pickup_address === "string" ? s.pickup_address : null,
    confirmationRequested: s.confirmation_requested === true,
  };
}

/** Only intents created by the new atomic triggers; no scan/replay of historical bookings. */
export async function runBookingEmailRecovery(): Promise<{ processed: number; completed: number; failed: number }> {
  const store = await db();
  const { data, error } = await store.rpc("booking_email_due_intents", { _limit: 5 });
  if (error) throw new Error(error.message);
  const stats = { processed: 0, completed: 0, failed: 0 };
  await Promise.all((data ?? []).map(async (intent) => {
    stats.processed++;
    let done = false;
    let failure = "Versand noch offen";
    try {
      if (intent.source_type === "booking") {
        const { reconcileBookingPostActions } = await import("@/lib/booking-actions.server");
        await reconcileBookingPostActions(intent.source_id, ["customer_confirmation_invoice", "admin_booking_email"]);
        const { data: actions, error: actionError } = await store.from("booking_actions").select("status")
          .eq("booking_id", intent.source_id).in("action_key", ["customer_confirmation_invoice", "admin_booking_email"]);
        if (actionError) throw new Error(actionError.message);
        done = actions?.length === 2 && actions.every((a) => a.status === "succeeded");
        if (!done) {
          const { data: rows, error: rowError } = await store.from("customer_mail_outbox").select("status,last_error,blocked_reason")
            .eq("source_type", "booking").eq("source_id", intent.source_id).in("kind", ["booking_confirmation", "admin_booking"]);
          if (rowError) throw new Error(rowError.message);
          done = rows?.length === 2 && rows.every((r) => ["sent", "cancelled", "blocked", "needs_review"].includes(r.status));
          failure = rows?.map((r) => r.last_error ?? r.blocked_reason ?? r.status).join(" · ") ?? failure;
        }
      } else {
        const { runCustomerConfirmation, createConfirmationDeps } = await import("@/lib/manual-confirmation.server");
        // Deleted reservations must not produce a new confirmation.
        const { data: exists, error: existsError } = await store.from("manual_reservations").select("id").eq("id", intent.source_id).maybeSingle();
        if (existsError) throw new Error(existsError.message);
        if (!exists) done = true;
        else {
          const snapshot = manualIntentSnapshot(intent.snapshot as Record<string, unknown>);
          const result = await runCustomerConfirmation(await createConfirmationDeps(snapshot), { reservationId: intent.source_id, revision: intent.revision });
          done = result.status === "sent" || result.status === "needs_review";
          if (result.status === "needs_review") failure = "Unklarer Versand außerhalb des sicheren Wiederholungsfensters – manuelle Prüfung nötig";
          if (result.status === "failed") failure = `${result.kind}: ${result.error}`;
          if (result.status === "blocked") failure = result.reason;
        }
      }
    } catch (e) { failure = String((e as Error)?.message ?? e).slice(0, 500); }
    const { error: writeError } = await store.from("booking_email_intents").update({
      status: done ? "completed" : "pending", completed_at: done ? new Date().toISOString() : null,
      attempts: intent.attempts + 1, last_error: failure === "Versand noch offen" && done ? null : failure,
      next_attempt_at: new Date(Date.now() + 600_000).toISOString(),
    }).eq("id", intent.id).eq("status", "pending");
    if (writeError) throw new Error(writeError.message);
    if (done) stats.completed++; else stats.failed++;
  }));
  return stats;
}