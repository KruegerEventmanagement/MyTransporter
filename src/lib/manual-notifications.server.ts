/**
 * Versand-Läufer für die Owner-Benachrichtigungen manueller Termine.
 *
 * Die Einreihung in `manual_reservation_notifications` passiert atomar per
 * Datenbank-Trigger zusammen mit der Datenänderung. Dieser Läufer holt offene
 * Einträge parallel-sicher (Lease + SKIP LOCKED), sendet die Owner-Mail über den
 * bestehenden Mailversand und pusht einmalig aufs Admin-Handy.
 *
 * Zustellgarantie: „mindestens ein Versuch, praktisch höchstens eine Zustellung"
 * – Mail- und Push-Fortschritt werden getrennt festgehalten, echte Exactly-once
 * über externe Anbieter ist nicht möglich.
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
  mail_sent_at?: string | null;
  lease_token?: string | null;
};

export type OutboxDeps = {
  claim: (limit: number) => Promise<OutboxRow[]>;
  /** true = Eintrag gehörte noch dieser Lease und wurde abgeschlossen. */
  complete: (id: string, pushSent: boolean, leaseToken: string | null) => Promise<boolean>;
  markMailed: (id: string, leaseToken: string | null) => Promise<boolean>;
  markPushed: (id: string, leaseToken: string | null) => Promise<boolean>;
  fail: (
    id: string,
    error: string,
    retryInSeconds: number,
    leaseToken: string | null,
  ) => Promise<boolean>;
  sendMail: (args: {
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
  }) => Promise<boolean>;
  push: (args: {
    title: string;
    body: string;
    url: string;
    tag: string;
  }) => Promise<{ sent?: number } | unknown>;
};

const KINDS: ManualNotificationEventKind[] = ["created", "updated", "deleted"];

/** Lease = 120 s, deshalb bleiben Anbieter-Aufrufe deutlich darunter. */
const MAIL_TIMEOUT_MS = 20_000;
const PUSH_TIMEOUT_MS = 15_000;

function backoffSeconds(attempts: number): number {
  return Math.min(Math.max(attempts, 1) * 300, 3600);
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: Zeitüberschreitung`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** pushToAdmins liefert {sent, skipped} – nur sent > 0 ist ein echter Versand. */
function pushWasSent(result: unknown): boolean {
  const sent = (result as { sent?: unknown } | null)?.sent;
  return typeof sent === "number" && sent > 0;
}

export async function runManualNotificationOutbox(
  deps: OutboxDeps,
  opts?: { limit?: number },
): Promise<{
  claimed: number;
  sent: number;
  failed: number;
  pushed: number;
  lost_lease: number;
}> {
  const rows = await deps.claim(Math.max(opts?.limit ?? 10, 1));
  let sent = 0;
  let failed = 0;
  let pushed = 0;
  let lostLease = 0;

  for (const row of rows) {
    const lease = row.lease_token ?? null;
    const kind = (KINDS as string[]).includes(row.event_kind)
      ? (row.event_kind as ManualNotificationEventKind)
      : "updated";
    try {
      const payload = sanitizeManualPayload(row.payload);
      const { subject, html } = buildManualNotificationEmail({ eventKind: kind, payload });

      // Mail nur senden, wenn sie nicht bereits nachweislich raus ist.
      let mailOk = Boolean(row.mail_sent_at);
      if (!mailOk) {
        mailOk = await withTimeout(
          deps.sendMail({
            to: OWNER_CALENDAR_EMAIL,
            subject,
            html,
            idempotencyKey: manualNotificationIdempotencyKey(
              row.reservation_id,
              kind,
              row.revision,
            ),
          }),
          MAIL_TIMEOUT_MS,
          "E-Mail-Versand",
        );

        if (!mailOk) {
          failed++;
          const owned = await deps.fail(
            row.id,
            "E-Mail-Versand fehlgeschlagen",
            backoffSeconds(row.attempts),
            lease,
          );
          if (!owned) lostLease++;
          continue;
        }
        // Mail-Fortschritt sofort festhalten: ein späterer Push-Retry darf
        // die Mail nicht erneut verschicken.
        const owned = await deps.markMailed(row.id, lease);
        if (!owned) {
          lostLease++;
          continue;
        }
        sent++;
      }

      // Push genau einmal pro Ereignis – unabhängig von Mail-Wiederholungen.
      let pushSent = Boolean(row.push_sent_at);
      let pushError: string | null = null;
      if (!pushSent) {
        try {
          const result = await withTimeout(
            Promise.resolve(
              deps.push({
                ...manualPushSummary(kind, payload),
                url: "/admin?tab=calendar",
                tag: `manual-res-${row.reservation_id}-${kind}-${row.revision}`,
              }),
            ),
            PUSH_TIMEOUT_MS,
            "Push",
          );
          if (pushWasSent(result)) {
            pushSent = true;
            pushed++;
            const owned = await deps.markPushed(row.id, lease);
            if (!owned) {
              lostLease++;
              continue;
            }
          } else {
            pushError = "Push wurde von keinem Gerät angenommen";
          }
        } catch (e) {
          pushError = `Push fehlgeschlagen: ${String((e as Error)?.message ?? e).slice(0, 200)}`;
        }
      }

      if (pushError) {
        // Mail ist erfolgreich – nur der Push bleibt retrybar.
        failed++;
        const owned = await deps.fail(row.id, pushError, backoffSeconds(row.attempts), lease);
        if (!owned) lostLease++;
        continue;
      }

      const owned = await deps.complete(row.id, pushSent, lease);
      if (!owned) lostLease++;
    } catch (e) {
      failed++;
      const owned = await deps.fail(
        row.id,
        String((e as Error)?.message ?? e).slice(0, 500),
        backoffSeconds(row.attempts),
        lease,
      );
      if (!owned) lostLease++;
    }
  }

  return { claimed: rows.length, sent, failed, pushed, lost_lease: lostLease };
}

/** Echte Abhängigkeiten (Datenbank, Resend, Web-Push). */
export async function createOutboxDeps(): Promise<OutboxDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendEmail } = await import("@/lib/booking-emails.server");
  const { pushToAdmins } = await import("@/lib/push.functions");

  const rpcBool = async (fn: string, args: Record<string, unknown>): Promise<boolean> => {
    const { data, error } = await supabaseAdmin.rpc(fn as never, args as never);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data === true;
  };

  return {
    claim: async (limit) => {
      const { data, error } = await supabaseAdmin.rpc("claim_manual_notifications", {
        _limit: limit,
        _lease_seconds: 120,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as OutboxRow[];
    },
    complete: (id, pushSent, leaseToken) =>
      rpcBool("complete_manual_notification", {
        _id: id,
        _push_sent: pushSent,
        _lease_token: leaseToken,
      }),
    markMailed: (id, leaseToken) =>
      rpcBool("mark_manual_notification_mailed", { _id: id, _lease_token: leaseToken }),
    markPushed: (id, leaseToken) =>
      rpcBool("mark_manual_notification_pushed", { _id: id, _lease_token: leaseToken }),
    fail: (id, error, retryInSeconds, leaseToken) =>
      rpcBool("fail_manual_notification", {
        _id: id,
        _error: error,
        _retry_in_seconds: retryInSeconds,
        _lease_token: leaseToken,
      }),
    sendMail: ({ to, subject, html, idempotencyKey }) =>
      sendEmail(to, subject, html, undefined, idempotencyKey),
    push: (args) => pushToAdmins(args) as Promise<{ sent?: number }>,
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
