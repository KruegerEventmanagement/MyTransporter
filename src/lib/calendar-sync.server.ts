/**
 * Serverseitige Google-Kalender-Synchronisierung (Zustand je Quelle).
 *
 * - DB-Trigger erhöhen nur die Version der Quelle in `calendar_sync_state`.
 * - Der Worker beansprucht eine Quelle per Lease, liest den AKTUELLEN Stand
 *   und schreibt genau diesen Stand. Wurde die Quelle während des Laufs erneut
 *   geändert, bleibt sie offen und wird mit dem neuesten Stand wiederholt.
 * - Bestehende, extern angelegte Termine werden über die exakte
 *   MyTransporter-ID in der Beschreibung übernommen (Zuordnung gespeichert).
 * - Fehler werden protokolliert und planmäßig wiederholt; ein Kalenderausfall
 *   verändert Buchung, Zahlung oder Verfügbarkeit nie.
 */

import {
  CALENDAR_ID,
  buildCalendarEvent,
  calendarBackoffSeconds,
  calendarEventId,
  decideCalendarAction,
  descriptionMatchesSource,
  type CalendarSourceState,
  type CalendarSourceType,
} from "@/lib/calendar-sync";

/** Gateway laut Connector-Dokumentation (google_calendar, Calendar API v3). */
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";
const REQUEST_TIMEOUT_MS = 15_000;

export type GoogleEventRef = { id: string; description?: string | null; status?: string };

export type CalendarDeps = {
  claim: (opts: { limit: number; sourceType?: CalendarSourceType; sourceId?: string }) => Promise<CalendarSourceState[]>;
  snapshot: (sourceType: CalendarSourceType, sourceId: string) => Promise<Record<string, unknown> | null>;
  setEvent: (s: CalendarSourceState, eventId: string, adopted: boolean) => Promise<boolean>;
  complete: (s: CalendarSourceState, r: { eventId: string | null; clear: boolean; adopted: boolean; action: string }) => Promise<boolean>;
  fail: (s: CalendarSourceState, error: string, retryIn: number) => Promise<boolean>;
  /** Kandidaten mit Freitextsuche; Treffer werden exakt geprüft. */
  searchEvents: (query: string) => Promise<GoogleEventRef[]>;
  /** Aktualisiert Termin `eventId`; `false` wenn nicht (mehr) vorhanden. */
  updateEvent: (eventId: string, body: Record<string, unknown>) => Promise<boolean>;
  /** Legt Termin mit fester ID an; `false` bei Konflikt (existiert schon). */
  insertEvent: (body: Record<string, unknown> & { id: string }) => Promise<boolean>;
  deleteEvent: (eventId: string) => Promise<void>;
};

export type CalendarRunResult = {
  claimed: number;
  synced: number;
  removed: number;
  skipped: number;
  adopted: number;
  failed: number;
  lost_lease: number;
};

function isSourceType(v: string): v is CalendarSourceType {
  return v === "booking" || v === "manual_reservation";
}

async function findAdoptable(deps: CalendarDeps, t: CalendarSourceType, id: string): Promise<string | null> {
  const own = calendarEventId(t, id);
  const hits = await deps.searchEvents(id);
  const match = hits.find(
    (e) => e.id && e.id !== own && e.status !== "cancelled" && descriptionMatchesSource(e.description, t, id),
  );
  return match?.id ?? null;
}

export async function runCalendarSync(
  deps: CalendarDeps,
  opts?: { limit?: number; sourceType?: CalendarSourceType; sourceId?: string },
): Promise<CalendarRunResult> {
  const states = await deps.claim({
    limit: Math.max(opts?.limit ?? 10, 1),
    sourceType: opts?.sourceType,
    sourceId: opts?.sourceId,
  });
  const r: CalendarRunResult = { claimed: states.length, synced: 0, removed: 0, skipped: 0, adopted: 0, failed: 0, lost_lease: 0 };

  for (const s of states) {
    try {
      if (!isSourceType(s.source_type)) throw new Error(`Unbekannte Quelle ${s.source_type}`);
      const t = s.source_type;
      const snap = await deps.snapshot(t, s.source_id);
      const action = decideCalendarAction(t, snap);
      let eventId = s.google_event_id;
      let adopted = false;
      let owned = true;

      if (action === "noop") {
        r.skipped++;
        owned = await deps.complete(s, { eventId: null, clear: false, adopted: false, action: "noop" });
      } else if (action === "upsert") {
        const event = buildCalendarEvent(t, s.source_id, snap);
        if (!eventId) {
          eventId = await findAdoptable(deps, t, s.source_id);
          if (eventId) {
            adopted = true;
            r.adopted++;
            if (!(await deps.setEvent(s, eventId, true))) throw new LeaseLost();
          }
        }
        const { id: ownId, ...body } = event;
        let done = false;
        if (eventId) done = await deps.updateEvent(eventId, { ...body, status: "confirmed" });
        if (!done) {
          // Kein bekannter Termin (oder extern gelöscht): mit fester ID anlegen.
          eventId = ownId;
          if (!(await deps.insertEvent(event))) {
            if (!(await deps.updateEvent(ownId, { ...body, status: "confirmed" }))) {
              throw new Error("Kalendertermin weder anlegbar noch aktualisierbar");
            }
          }
        }
        r.synced++;
        owned = await deps.complete(s, { eventId, clear: false, adopted, action: "upsert" });
      } else {
        const ids = new Set<string>([calendarEventId(t, s.source_id)]);
        if (eventId) ids.add(eventId);
        else {
          const found = await findAdoptable(deps, t, s.source_id);
          if (found) ids.add(found);
        }
        for (const id of ids) await deps.deleteEvent(id);
        r.removed++;
        owned = await deps.complete(s, { eventId: null, clear: true, adopted: false, action: "delete" });
      }
      if (!owned) r.lost_lease++;
    } catch (e) {
      if (e instanceof LeaseLost) {
        r.lost_lease++;
        continue;
      }
      r.failed++;
      const ok = await deps.fail(s, String((e as Error)?.message ?? e).slice(0, 500), calendarBackoffSeconds(s.attempts));
      if (!ok) r.lost_lease++;
    }
  }
  return r;
}

class LeaseLost extends Error {}

/** Env-Namen gemäß Connector: LOVABLE_API_KEY + GOOGLE_CALENDAR_API_KEY. */
export function calendarCredentialsPresent(): boolean {
  return Boolean(process.env.LOVABLE_API_KEY && process.env.GOOGLE_CALENDAR_API_KEY);
}

async function gateway(method: string, path: string, body?: unknown): Promise<{ status: number; text: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connectionKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!lovableKey || !connectionKey) {
    throw new Error("Google-Kalender ist nicht verbunden (GOOGLE_CALENDAR_API_KEY fehlt)");
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
const ok = (s: number) => s >= 200 && s < 300;

export async function createCalendarDeps(): Promise<CalendarDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabaseAdmin.rpc(fn as never, args as never);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as unknown;
  };

  return {
    claim: async ({ limit, sourceType, sourceId }) =>
      ((await rpc("claim_calendar_sources", {
        _limit: limit,
        _lease_seconds: 120,
        _source_type: sourceType ?? null,
        _source_id: sourceId ?? null,
      })) ?? []) as CalendarSourceState[],
    snapshot: async (t, id) =>
      ((await rpc("calendar_source_snapshot", { _source_type: t, _source_id: id })) ?? null) as Record<string, unknown> | null,
    setEvent: async (s, eventId, adopted) =>
      (await rpc("set_calendar_source_event", {
        _source_type: s.source_type, _source_id: s.source_id, _lease_token: s.lease_token,
        _google_event_id: eventId, _adopted: adopted,
      })) === true,
    complete: async (s, x) =>
      (await rpc("complete_calendar_source", {
        _source_type: s.source_type, _source_id: s.source_id, _lease_token: s.lease_token,
        _google_event_id: x.eventId, _clear_event: x.clear, _adopted: x.adopted, _action: x.action,
      })) === true,
    fail: async (s, error, retryIn) =>
      (await rpc("fail_calendar_source", {
        _source_type: s.source_type, _source_id: s.source_id, _lease_token: s.lease_token,
        _error: error, _retry_in_seconds: retryIn,
      })) === true,
    searchEvents: async (query) => {
      const q = new URLSearchParams({ q: query, showDeleted: "false", maxResults: "20", singleEvents: "true" });
      const res = await gateway("GET", `/calendars/${cal}/events?${q}`);
      if (!ok(res.status)) throw new Error(`Kalender-Suche fehlgeschlagen [${res.status}]: ${res.text}`);
      return (JSON.parse(res.text)?.items ?? []) as GoogleEventRef[];
    },
    updateEvent: async (eventId, body) => {
      const res = await gateway("PUT", `/calendars/${cal}/events/${encodeURIComponent(eventId)}`, body);
      if (ok(res.status)) return true;
      if (res.status === 404 || res.status === 410) return false;
      throw new Error(`Kalender-Update fehlgeschlagen [${res.status}]: ${res.text}`);
    },
    insertEvent: async (body) => {
      const res = await gateway("POST", `/calendars/${cal}/events`, body);
      if (ok(res.status)) return true;
      if (res.status === 409) return false;
      throw new Error(`Kalendereintrag fehlgeschlagen [${res.status}]: ${res.text}`);
    },
    deleteEvent: async (eventId) => {
      const res = await gateway("DELETE", `/calendars/${cal}/events/${encodeURIComponent(eventId)}`);
      if (ok(res.status) || res.status === 404 || res.status === 410) return;
      throw new Error(`Kalender-Löschung fehlgeschlagen [${res.status}]: ${res.text}`);
    },
  };
}

export async function processCalendarSync(opts?: { limit?: number }): Promise<CalendarRunResult> {
  return runCalendarSync(await createCalendarDeps(), opts);
}

/**
 * Sofortversuch NUR für die betroffene Quelle (kein Batch alter Aufträge).
 * Ohne Verbindung wird nichts versucht – der Zustand bleibt offen/retrybar.
 */
export async function kickCalendarSync(sourceType: CalendarSourceType, sourceId: string): Promise<void> {
  if (!calendarCredentialsPresent()) return;
  try {
    await runCalendarSync(await createCalendarDeps(), { limit: 1, sourceType, sourceId });
  } catch (e) {
    console.warn("[calendar-sync] Sofortübertragung fehlgeschlagen:", e);
  }
}
