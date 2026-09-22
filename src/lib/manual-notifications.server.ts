/**
 * Versand-Läufer für die Owner-Benachrichtigungen manueller Termine.
 *
 * Die Einreihung in `manual_reservation_notifications` passiert atomar per
 * Datenbank-Trigger zusammen mit der Datenänderung. Dieser Läufer holt offene
 * Einträge parallel-sicher (Lease + SKIP LOCKED), sendet die Owner-Mail über den
 * bestehenden Mailversand und pusht einmalig aufs Admin-Handy. Fehler bleiben
 * retrybar – eine gespeicherte Reservierung wird dabei nie zurückgerollt.
 */

import {
  buildManualNotificationEmail,
  manualNotificationIdempotencyKey,
  manualPushSummary,
  sanitizeManualPayload,
  OWNER_CALENDAR_EMAIL,
  type ManualNotificationEventKind,
} from "@/lib/manual-notifications";

export type OutboxRow = {
  id: string;
  reservation_id: string;
  event_kind: string;
  revision: number;
  payload: unknown;
  attempts: number;
  push_sent_at: string | null;
};

export type OutboxDeps = {
  claim: (limit: number) => Promise<OutboxRow[]>;
  complete: (id: string, pushSent: boolean) => Promise<void>;
  markPushed: (id: string) => Promise<void>;
  fail: (id: string, error: string, retryInSeconds: number) => Promise<void>;
  sendMail: (args: {
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
  }) => Promise<boolean>;
  push: (args: { title: string; body: string; url: string; tag: string }) => Promise<unknown>;
};

const KINDS: ManualNotificationEventKind[] = ["created", "updated", "deleted"];

function backoffSeconds(attempts: number): number {
  return Math.min(Math.max(attempts, 1) * 300, 3600);
}

export async function runManualNotificationOutbox(
  deps: OutboxDeps,
  opts?: { limit?: number },
): Promise<{ claimed: number; sent: number; failed: number; pushed: number }> {
  const rows = await deps.claim(Math.max(opts?.limit ?? 10, 1));
  let sent = 0;
  let failed = 0;
  let pushed = 0;

  for (const row of rows) {
    const kind = (KINDS as string[]).includes(row.event_kind)
      ? (row.event_kind as ManualNotificationEventKind)
      : "updated";
    try {
      const payload = sanitizeManualPayload(row.payload);
      const { subject, html } = buildManualNotificationEmail({ eventKind: kind, payload });
      const ok = await deps.sendMail({
        to: OWNER_CALENDAR_EMAIL,
        subject,
        html,
        idempotencyKey: manualNotificationIdempotencyKey(row.reservation_id, kind, row.revision),
      });

      if (!ok) {
        failed++;
        await deps.fail(row.id, "E-Mail-Versand fehlgeschlagen", backoffSeconds(row.attempts));
        continue;
      }

      // Push genau einmal pro Ereignis – auch wenn die Mail wiederholt wurde.
      let pushSent = false;
      if (!row.push_sent_at) {
        const summary = manualPushSummary(kind, payload);
        try {
          await deps.push({
            ...summary,
            url: "/admin?tab=calendar",
            tag: `manual-res-${row.reservation_id}-${kind}-${row.revision}`,
          });
          pushSent = true;
          pushed++;
        } catch {
          // Ein Push-Fehler darf die erfolgreich versendete Mail nicht entwerten.
          pushSent = false;
        }
      }

      sent++;
      await deps.complete(row.id, pushSent);
    } catch (e) {
      failed++;
      await deps.fail(
        row.id,
        String((e as Error)?.message ?? e).slice(0, 500),
        backoffSeconds(row.attempts),
      );
    }
  }

  return { claimed: rows.length, sent, failed, pushed };
}

/** Echte Abhängigkeiten (Datenbank, Resend, Web-Push). */
export async function createOutboxDeps(): Promise<OutboxDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendEmail } = await import("@/lib/booking-emails.server");
  const { pushToAdmins } = await import("@/lib/push.functions");

  return {
    claim: async (limit) => {
      const { data, error } = await supabaseAdmin.rpc("claim_manual_notifications", {
        _limit: limit,
        _lease_seconds: 120,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as OutboxRow[];
    },
    complete: async (id, pushSent) => {
      await supabaseAdmin.rpc("complete_manual_notification", {
        _id: id,
        _push_sent: pushSent,
      });
    },
    markPushed: async (id) => {
      await supabaseAdmin.rpc("mark_manual_notification_pushed", { _id: id });
    },
    fail: async (id, error, retryInSeconds) => {
      await supabaseAdmin.rpc("fail_manual_notification", {
        _id: id,
        _error: error,
        _retry_in_seconds: retryInSeconds,
      });
    },
    sendMail: ({ to, subject, html, idempotencyKey }) =>
      sendEmail(to, subject, html, undefined, idempotencyKey),
    push: (args) => pushToAdmins(args),
  };
}

/** Verarbeitet offene Benachrichtigungen mit den echten Abhängigkeiten. */
export async function processManualNotificationOutbox(opts?: { limit?: number }) {
  const deps = await createOutboxDeps();
  return runManualNotificationOutbox(deps, opts);
}

/**
 * Sofortversand nach einer Änderung – bewusst „best effort". Schlägt er fehl,
 * bleibt der Eintrag in der Warteschlange und wird planmäßig wiederholt.
 */
export async function kickManualNotificationOutbox(): Promise<void> {
  try {
    await processManualNotificationOutbox({ limit: 5 });
  } catch (e) {
    console.warn("Manual-Benachrichtigung konnte nicht sofort versendet werden:", e);
  }
}
