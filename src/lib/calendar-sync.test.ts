import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  buildCalendarEvent,
  calendarBackoffSeconds,
  calendarEventId,
  decideCalendarAction,
  descriptionMatchesSource,
  CALENDAR_TIME_ZONE,
  REMINDER_MINUTES,
  type CalendarSourceState,
  type CalendarSourceType,
} from "@/lib/calendar-sync";
import { runCalendarSync, type CalendarDeps, type GoogleEventRef } from "@/lib/calendar-sync.server";

const BOOKING_ID = "9145b6dc-251d-4e28-99d3-173167f9c3ed";
const MANUAL_ID = "8f14e45f-ceea-467a-9c38-1bd4e0f2a1b7";

const paid = (over: Record<string, unknown> = {}) => ({
  booking_id: BOOKING_ID,
  status: "paid",
  vehicle_name: "Citroën Jumper L1H1",
  vehicle_plate: "LEO MY 102",
  plan_label: "24 Stunden",
  customer_name: "Marcel Zipperle",
  start_at: "2026-09-26T06:00:00Z",
  end_at: "2026-09-27T06:00:00Z",
  ...over,
});

/** In-Memory-Nachbildung von calendar_sync_state + Google-Kalender. */
function world() {
  type Row = CalendarSourceState & { lease_version: number | null; lease_valid: boolean; last_action?: string };
  const rows = new Map<string, Row>();
  const sources = new Map<string, Record<string, unknown> | null>();
  const google = new Map<string, { description: string; body: Record<string, unknown> }>();
  const writes: string[] = [];
  const key = (t: string, id: string) => `${t}:${id}`;
  let lease = 0;

  const dirty = (t: CalendarSourceType, id: string, snap: Record<string, unknown> | null) => {
    sources.set(key(t, id), snap);
    const r = rows.get(key(t, id));
    if (r) r.version++;
    else rows.set(key(t, id), { source_type: t, source_id: id, version: 1, synced_version: 0, google_event_id: null, attempts: 0, lease_token: null, lease_version: null, lease_valid: false });
  };

  const deps: CalendarDeps = {
    claim: async ({ limit, sourceType, sourceId }) => {
      const out: CalendarSourceState[] = [];
      for (const r of rows.values()) {
        if (out.length >= limit) break;
        if (r.synced_version >= r.version || r.lease_valid) continue;
        if (sourceType && r.source_type !== sourceType) continue;
        if (sourceId && r.source_id !== sourceId) continue;
        r.lease_token = `l${++lease}`;
        r.lease_version = r.version;
        r.lease_valid = true;
        r.attempts++;
        out.push({ ...r });
      }
      return out;
    },
    snapshot: async (t, id) => sources.get(key(t, id)) ?? null,
    setEvent: async (s, id) => {
      const r = rows.get(key(s.source_type, s.source_id))!;
      if (!r.lease_valid || r.lease_token !== s.lease_token) return false;
      r.google_event_id = id;
      return true;
    },
    complete: async (s, x) => {
      const r = rows.get(key(s.source_type, s.source_id))!;
      if (!r.lease_valid || r.lease_token !== s.lease_token) return false;
      r.synced_version = Math.max(r.synced_version, r.lease_version!);
      r.google_event_id = x.clear ? null : (x.eventId ?? r.google_event_id);
      r.last_action = x.action;
      r.lease_valid = false;
      r.lease_token = null;
      return true;
    },
    fail: async (s) => {
      const r = rows.get(key(s.source_type, s.source_id))!;
      if (r.lease_token !== s.lease_token) return false;
      r.lease_valid = false;
      r.lease_token = null;
      return true;
    },
    searchEvents: async (q) =>
      [...google.entries()]
        .filter(([, v]) => v.description.includes(q))
        .map(([id, v]) => ({ id, description: v.description }) as GoogleEventRef),
    updateEvent: async (id, body) => {
      if (!google.has(id)) return false;
      writes.push(`update:${id}`);
      google.set(id, { description: String(body.description), body });
      return true;
    },
    insertEvent: async (body) => {
      if (google.has(body.id)) return false;
      writes.push(`insert:${body.id}`);
      google.set(body.id, { description: String(body.description), body });
      return true;
    },
    deleteEvent: async (id) => {
      writes.push(`delete:${id}`);
      google.delete(id);
    },
  };
  return { rows, sources, google, writes, deps, dirty, key };
}

describe("Termin-Inhalt", () => {
  it("Titel MyTransporter · Kennzeichen · Kunde, privat, keine Teilnehmer, 5 Erinnerungen", () => {
    const ev = buildCalendarEvent("booking", BOOKING_ID, paid());
    expect(ev.summary).toBe("MyTransporter · LEO MY 102 · Marcel Zipperle");
    expect(ev.visibility).toBe("private");
    expect(ev.attendees).toEqual([]);
    expect(ev.reminders.overrides.map((o) => o.minutes)).toEqual([...REMINDER_MINUTES]);
    expect(ev.start.timeZone).toBe(CALENDAR_TIME_ZONE);
    expect(ev.description).toContain(`MyTransporter-Booking-ID: ${BOOKING_ID}`);
  });

  it("überträgt keine Codes, Notizen, Geburtsdaten oder Kontaktdaten", () => {
    const ev = buildCalendarEvent("manual_reservation", MANUAL_ID, {
      ...paid(), pickup_code: "ABC123", note: "Tür 4711", customer_birth_date: "1990-01-01",
      customer_phone: "+49 111", customer_email: "x@y.de", customer_id_number: "L01X",
    });
    const all = JSON.stringify(ev);
    for (const bad of ["ABC123", "4711", "1990-01-01", "+49 111", "x@y.de", "L01X"]) expect(all).not.toContain(bad);
  });

  it("Datenbank-Snapshots enthalten keine Codes/sensiblen Felder (neueste Migration)", () => {
    const dir = "supabase/migrations";
    const file = readdirSync(dir).filter((f) => readFileSync(`${dir}/${f}`, "utf8").includes("manual_reservation_calendar_payload")).sort().pop()!;
    const sql = readFileSync(`${dir}/${file}`, "utf8");
    const fn = (name: string) => sql.slice(sql.indexOf(`FUNCTION public.${name}`), sql.indexOf("$$;", sql.indexOf(`FUNCTION public.${name}`)));
    for (const body of [fn("booking_calendar_payload"), fn("manual_reservation_calendar_payload")]) {
      for (const bad of ["pickup_code", "return_code", "note", "birth_date", "id_number", "license", "customer_phone", "customer_email", "street"]) {
        expect(body).not.toContain(bad);
      }
    }
  });

  it("deterministische, von Google erlaubte IDs", () => {
    expect(calendarEventId("booking", BOOKING_ID)).toMatch(/^[0-9a-v]{5,}$/);
    expect(calendarEventId("booking", BOOKING_ID)).not.toBe(calendarEventId("manual_reservation", BOOKING_ID));
    expect(calendarBackoffSeconds(99)).toBe(3600);
  });
});

describe("Statushistorie", () => {
  it.each([
    ["paid", "upsert"], ["confirmed", "upsert"], ["picked_up", "upsert"],
    ["cancelled", "delete"], ["canceled", "delete"],
    ["completed", "noop"], ["refunded", "noop"], ["pending", "noop"], ["failed", "noop"], ["expired", "noop"],
  ])("Buchung %s → %s", (status, action) => {
    expect(decideCalendarAction("booking", { status })).toBe(action);
  });
  it("gelöschte Buchungszeile löscht nichts; gelöschter manueller Termin wird entfernt", () => {
    expect(decideCalendarAction("booking", null)).toBe("noop");
    expect(decideCalendarAction("manual_reservation", null)).toBe("delete");
  });
  it("abgeschlossene Miete bleibt als Historie im Kalender", async () => {
    const w = world();
    w.dirty("booking", BOOKING_ID, paid());
    await runCalendarSync(w.deps);
    w.dirty("booking", BOOKING_ID, paid({ status: "completed" }));
    const r = await runCalendarSync(w.deps);
    expect(r.skipped).toBe(1);
    expect(w.google.size).toBe(1);
  });
  it("unbezahlter Checkout erzeugt keinen Termin", async () => {
    const w = world();
    w.dirty("booking", BOOKING_ID, paid({ status: "pending" }));
    await runCalendarSync(w.deps);
    expect(w.writes).toEqual([]);
  });
});

describe("Reihenfolge & Versionen", () => {
  it("out-of-order: Storno während laufendem Upsert wird nicht überholt", async () => {
    const w = world();
    w.dirty("booking", BOOKING_ID, paid());
    const origInsert = w.deps.insertEvent;
    w.deps.insertEvent = async (b) => {
      // Während des Google-Schreibens wird storniert
      w.dirty("booking", BOOKING_ID, paid({ status: "cancelled" }));
      return origInsert(b);
    };
    await runCalendarSync(w.deps);
    const row = w.rows.get(w.key("booking", BOOKING_ID))!;
    expect(row.synced_version).toBeLessThan(row.version); // bleibt offen
    w.deps.insertEvent = origInsert;
    await runCalendarSync(w.deps);
    expect(w.google.size).toBe(0);
    expect(row.synced_version).toBe(row.version);
  });

  it("A → B → A wird jeweils übertragen (keine Hash-Unterdrückung)", async () => {
    const w = world();
    const A = paid(), B = paid({ start_at: "2026-09-26T08:00:00Z", end_at: "2026-09-27T08:00:00Z" });
    for (const s of [A, B, A]) {
      w.dirty("booking", BOOKING_ID, s);
      await runCalendarSync(w.deps);
    }
    const ev = [...w.google.values()][0].body as { start: { dateTime: string } };
    expect(ev.start.dateTime).toBe(A.start_at);
    expect(w.writes.length).toBe(3);
  });

  it("Storno → Reaktivierung legt den Termin wieder an", async () => {
    const w = world();
    for (const st of ["paid", "cancelled", "paid"]) {
      w.dirty("booking", BOOKING_ID, paid({ status: st }));
      await runCalendarSync(w.deps);
    }
    expect(w.google.size).toBe(1);
  });

  it("Quellen-Lease: parallele Läufe schreiben dieselbe Quelle nur einmal", async () => {
    const w = world();
    w.dirty("booking", BOOKING_ID, paid());
    const [a, b] = await Promise.all([runCalendarSync(w.deps), runCalendarSync(w.deps)]);
    expect(a.claimed + b.claimed).toBe(1);
    expect(w.writes).toHaveLength(1);
  });

  it("verlorene Lease schließt nicht ab", async () => {
    const w = world();
    w.dirty("booking", BOOKING_ID, paid());
    w.deps.complete = async () => false;
    const r = await runCalendarSync(w.deps);
    expect(r.lost_lease).toBe(1);
  });

  it("Sofortversuch ist quellen-spezifisch", async () => {
    const w = world();
    w.dirty("booking", BOOKING_ID, paid());
    w.dirty("manual_reservation", MANUAL_ID, paid({ customer_name: "Alt" }));
    const r = await runCalendarSync(w.deps, { limit: 1, sourceType: "manual_reservation", sourceId: MANUAL_ID });
    expect(r.claimed).toBe(1);
    expect(w.writes).toEqual([`insert:${calendarEventId("manual_reservation", MANUAL_ID)}`]);
  });

  it("Google-Fehler bleibt retrybar und zählt als failed", async () => {
    const w = world();
    w.dirty("booking", BOOKING_ID, paid());
    w.deps.insertEvent = async () => { throw new Error("[503] down"); };
    const r = await runCalendarSync(w.deps);
    expect(r.failed).toBe(1);
    expect(w.rows.get(w.key("booking", BOOKING_ID))!.synced_version).toBe(0);
  });
});

describe("Übernahme bestehender Termine", () => {
  it("exakte ID-Prüfung", () => {
    const d = `Text\nMyTransporter-Booking-ID: ${BOOKING_ID}\n`;
    expect(descriptionMatchesSource(d, "booking", BOOKING_ID)).toBe(true);
    expect(descriptionMatchesSource(d, "manual_reservation", BOOKING_ID)).toBe(false);
    expect(descriptionMatchesSource(`MyTransporter-Booking-ID: ${BOOKING_ID}0`, "booking", BOOKING_ID)).toBe(false);
    expect(descriptionMatchesSource(`erwähnt ${BOOKING_ID}`, "booking", BOOKING_ID)).toBe(false);
  });

  it("zugeordneter Termin 7u46… wird aktualisiert, nicht neu angelegt", async () => {
    const w = world();
    w.google.set("7u46jn3lsk3efopalca3r7591c", { description: `MyTransporter-Booking-ID: ${BOOKING_ID}`, body: {} });
    w.dirty("booking", BOOKING_ID, paid());
    w.rows.get(w.key("booking", BOOKING_ID))!.google_event_id = "7u46jn3lsk3efopalca3r7591c";
    await runCalendarSync(w.deps);
    expect(w.writes).toEqual(["update:7u46jn3lsk3efopalca3r7591c"]);
    expect(w.google.size).toBe(1);
  });

  it("Legacy-Termin ohne Zuordnung wird per Beschreibung adoptiert", async () => {
    const w = world();
    w.google.set("legacyevent1", { description: `MyTransporter-Reservation-ID: ${MANUAL_ID}`, body: {} });
    w.google.set("fremd", { description: `MyTransporter-Reservation-ID: ${MANUAL_ID}x`, body: {} });
    w.dirty("manual_reservation", MANUAL_ID, paid({ customer_name: "Kunde" }));
    const r = await runCalendarSync(w.deps);
    expect(r.adopted).toBe(1);
    expect(w.writes).toEqual(["update:legacyevent1"]);
    expect(w.rows.get(w.key("manual_reservation", MANUAL_ID))!.google_event_id).toBe("legacyevent1");
  });

  it("Löschung eines manuellen Termins entfernt den adoptierten Termin", async () => {
    const w = world();
    w.google.set("legacyevent1", { description: `MyTransporter-Reservation-ID: ${MANUAL_ID}`, body: {} });
    w.dirty("manual_reservation", MANUAL_ID, null);
    await runCalendarSync(w.deps);
    expect(w.google.has("legacyevent1")).toBe(false);
  });
});
