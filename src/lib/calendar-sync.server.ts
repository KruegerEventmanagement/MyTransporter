/**
 * Serverseitige Google-Kalender-Synchronisierung.
 *
 * Läuft über die Kalender-Warteschlange `calendar_sync_jobs`:
 * - Einreihung erfolgt atomar per Datenbank-Trigger (Buchung bezahlt/geändert/
 *   storniert, manueller Termin angelegt/geändert/gelöscht).
 * - Dieser Läufer holt offene Aufträge parallel-sicher (Lease + SKIP LOCKED)
 *   und schreibt sie über die verbundene Google-Calendar-Verbindung.
 * - Termin-Kennungen sind deterministisch ⇒ Wiederholungen erzeugen nie Dubletten.
 * - Fehler werden im Auftrag protokolliert und planmäßig wiederholt; ein
 *   Kalenderausfall verändert Buchung, Zahlung oder Verfügbarkeit nie.
 */

import {
  CALENDAR_ID,
  buildCalendarEvent,
  calendarBackoffSeconds,
  calendarEventId,
  type CalendarJob,
  type CalendarSourceType,
} from "@/lib/calendar-sync";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";
const REQUEST_TIMEOUT_MS = 20_000;

export type CalendarDeps = {
  claim: (limit: number) => Promise<CalendarJob[]>;
  complete: (id: string, googleEventId: string | null, lease: string | null) => Promise<boolean>;
  fail: (id: string, error: string, retryIn: number, lease: string | null) => Promise<boolean>;
  /** Legt an oder aktualisiert und liefert die Google-Termin-Kennung. */
  upsertEvent: (sourceType: CalendarSourceType, sourceId: string, payload: unknown) => Promise<string>;
  deleteEvent: (sourceType: CalendarSourceType, sourceId: string) => Promise<void>;
};

export type CalendarRunResult = {
  claimed: number;
  synced: number;
  removed: number;
  failed: number;
  lost_lease: number;
};

function isSourceType(v: string): v is CalendarSourceType {
  return v === "booking" || v === "manual_reservation";
}

export async function runCalendarSync(
  deps: CalendarDeps,
  opts?: { limit?: number },
): Promise<CalendarRunResult> {
  const jobs = await deps.claim(Math.max(opts?.limit ?? 10, 1));
  let synced = 0;
  let removed = 0;
  let failed = 0;
  let lostLease = 0;

  for (const job of jobs) {
    const lease = job.lease_token ?? null;
    try {
      if (!isSourceType(job.source_type)) throw new Error(`Unbekannte Quelle ${job.source_type}`);
      let eventId: string | null = null;
      if (job.event_kind === "delete") {
        await deps.deleteEvent(job.source_type, job.source_id);
        removed++;
      } else {
        eventId = await deps.upsertEvent(job.source_type, job.source_id, job.payload);
        synced++;
      }
      const owned = await deps.complete(job.id, eventId, lease);
      if (!owned) lostLease++;
    } catch (e) {
      failed++;
      const owned = await deps.fail(
        job.id,
        String((e as Error)?.message ?? e).slice(0, 500),
        calendarBackoffSeconds(job.attempts),
        lease,
      );
      if (!owned) lostLease++;
    }
  }

  return { claimed: jobs.length, synced, removed, failed, lost_lease: lostLease };
}

/** Ist eine Google-Calendar-Verbindung im Projekt hinterlegt? */
export function calendarCredentialsPresent(): boolean {
  return Boolean(process.env.LOVABLE_API_KEY && process.env.GOOGLE_CALENDAR_API_KEY);
}

async function gateway(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; text: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connectionKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!lovableKey || !connectionKey) {
    throw new Error(
      "Google-Kalender ist nicht verbunden (Verbindung fehlt) – Kalenderübertragung nicht möglich",
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${GATEWAY_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connectionKey,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    return { status: res.status, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

const cal = encodeURIComponent(CALENDAR_ID);

/** Echte Abhängigkeiten (Datenbank + Google Calendar über die Verbindung). */
export async function createCalendarDeps(): Promise<CalendarDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const rpcBool = async (fn: string, args: Record<string, unknown>): Promise<boolean> => {
    const { data, error } = await supabaseAdmin.rpc(fn as never, args as never);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data === true;
  };

  return {
    claim: async (limit) => {
      const { data, error } = await supabaseAdmin.rpc("claim_calendar_sync_jobs" as never, {
        _limit: limit,
        _lease_seconds: 120,
      } as never);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CalendarJob[];
    },
    complete: (id, googleEventId, lease) =>
      rpcBool("complete_calendar_sync_job", {
        _id: id,
        _google_event_id: googleEventId,
        _lease_token: lease,
      }),
    fail: (id, error, retryIn, lease) =>
      rpcBool("fail_calendar_sync_job", {
        _id: id,
        _error: error,
        _retry_in_seconds: retryIn,
        _lease_token: lease,
      }),
    upsertEvent: async (sourceType, sourceId, payload) => {
      const event = buildCalendarEvent(sourceType, sourceId, payload);
      // Anlegen mit fester Kennung; existiert der Termin schon (409), aktualisieren.
      const created = await gateway("POST", `/calendars/${cal}/events`, event);
      if (created.status === 200 || created.status === 201) return event.id;
      if (created.status === 409) {
        const patched = await gateway("PUT", `/calendars/${cal}/events/${event.id}`, {
          ...event,
          status: "confirmed",
        });
        if (patched.status >= 200 && patched.status < 300) return event.id;
        throw new Error(`Kalender-Update fehlgeschlagen [${patched.status}]: ${patched.text}`);
      }
      throw new Error(`Kalendereintrag fehlgeschlagen [${created.status}]: ${created.text}`);
    },
    deleteEvent: async (sourceType, sourceId) => {
      const id = calendarEventId(sourceType, sourceId);
      const res = await gateway("DELETE", `/calendars/${cal}/events/${id}`);
      // Nicht vorhanden / bereits gelöscht ⇒ Ziel erreicht.
      if ((res.status >= 200 && res.status < 300) || res.status === 404 || res.status === 410) {
        return;
      }
      throw new Error(`Kalender-Löschung fehlgeschlagen [${res.status}]: ${res.text}`);
    },
  };
}

export async function processCalendarSync(opts?: { limit?: number }): Promise<CalendarRunResult> {
  const deps = await createCalendarDeps();
  return runCalendarSync(deps, opts);
}

/**
 * Sofortige Übertragung nach einer Buchung/Änderung – bewusst „best effort".
 * Schlägt sie fehl, bleibt der Auftrag in der Warteschlange und wird
 * planmäßig wiederholt. Die bezahlte Buchung bleibt davon unberührt.
 */
export async function kickCalendarSync(): Promise<void> {
  try {
    await processCalendarSync({ limit: 5 });
  } catch (e) {
    console.warn("[calendar-sync] Sofortübertragung fehlgeschlagen:", e);
  }
}
