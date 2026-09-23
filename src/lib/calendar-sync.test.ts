import { describe, it, expect } from "vitest";
import {
  buildCalendarEvent,
  calendarBackoffSeconds,
  calendarEventId,
  CALENDAR_TIME_ZONE,
} from "@/lib/calendar-sync";
import { runCalendarSync, type CalendarDeps } from "@/lib/calendar-sync.server";

const BOOKING_ID = "8f14e45f-ceea-467a-9c38-1bd4e0f2a1b7";

const bookingPayload = {
  booking_id: BOOKING_ID,
  source_type: "booking",
  status: "paid",
  vehicle_name: "Citroën Jumper L1H1",
  vehicle_plate: "LEO MY 102",
  plan_label: "24 Stunden",
  pickup_code: "ABC123",
  start_at: "2026-09-25T08:00:00Z",
  end_at: "2026-09-26T08:00:00Z",
};

describe("calendarEventId", () => {
  it("ist deterministisch und quellgetrennt", () => {
    expect(calendarEventId("booking", BOOKING_ID)).toBe(calendarEventId("booking", BOOKING_ID));
    expect(calendarEventId("booking", BOOKING_ID)).not.toBe(
      calendarEventId("manual_reservation", BOOKING_ID),
    );
  });

  it("nutzt nur von Google erlaubte Zeichen", () => {
    expect(calendarEventId("booking", BOOKING_ID)).toMatch(/^[0-9a-v]{5,}$/);
  });
});

describe("buildCalendarEvent", () => {
  it("überträgt Mietzeitraum in Europe/Berlin mit Erinnerungen", () => {
    const ev = buildCalendarEvent("booking", BOOKING_ID, bookingPayload);
    expect(ev.start).toEqual({ dateTime: "2026-09-25T08:00:00Z", timeZone: CALENDAR_TIME_ZONE });
    expect(ev.end.dateTime).toBe("2026-09-26T08:00:00Z");
    expect(ev.reminders.overrides.map((o) => o.minutes)).toEqual([10080, 4320, 360, 180, 60]);
    expect(ev.visibility).toBe("private");
    expect(ev.summary).toContain("LEO MY 102");
  });

  it("überträgt keine Abholcodes oder Notizen", () => {
    const ev = buildCalendarEvent("booking", BOOKING_ID, { ...bookingPayload, note: "Türcode 4711" });
    const dump = JSON.stringify(ev);
    expect(dump).not.toContain("ABC123");
    expect(dump).not.toContain("4711");
  });

  it("verweigert unbrauchbare Zeiträume", () => {
    expect(() => buildCalendarEvent("booking", BOOKING_ID, { start_at: "x", end_at: "y" })).toThrow();
    expect(() =>
      buildCalendarEvent("booking", BOOKING_ID, {
        start_at: "2026-09-25T08:00:00Z",
        end_at: "2026-09-25T08:00:00Z",
      }),
    ).toThrow();
  });

  it("nennt bei manuellen Terminen den Kunden, ohne sensible Felder", () => {
    const ev = buildCalendarEvent("manual_reservation", BOOKING_ID, {
      reservation_id: BOOKING_ID,
      customer_name: "Claudia S.",
      customer_birth_date: "1980-01-01",
      vehicle_plate: "LEO MY 101",
      start_at: "2026-09-25T08:00:00Z",
      end_at: "2026-09-25T20:00:00Z",
    });
    expect(ev.description).toContain("Claudia S.");
    expect(JSON.stringify(ev)).not.toContain("1980-01-01");
  });
});

function deps(overrides: Partial<CalendarDeps> & { jobs: Parameters<never> | unknown }) {
  const calls: string[] = [];
  const base: CalendarDeps = {
    claim: async () => (overrides.jobs as never) ?? [],
    complete: async (id) => {
      calls.push(`complete:${id}`);
      return true;
    },
    fail: async (id, error) => {
      calls.push(`fail:${id}:${error}`);
      return true;
    },
    upsertEvent: async (t, id) => {
      calls.push(`upsert:${id}`);
      return calendarEventId(t, id);
    },
    deleteEvent: async (_t, id) => {
      calls.push(`delete:${id}`);
    },
    ...overrides,
  };
  return { deps: base, calls };
}

const job = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "job-1",
  source_type: "booking",
  source_id: BOOKING_ID,
  event_kind: "upsert",
  payload: bookingPayload,
  attempts: 1,
  lease_token: "lease-1",
  ...over,
});

describe("runCalendarSync", () => {
  it("überträgt einen Auftrag und schließt ihn ab", async () => {
    const { deps: d, calls } = deps({ jobs: [job()] });
    const res = await runCalendarSync(d);
    expect(res).toMatchObject({ claimed: 1, synced: 1, failed: 0, lost_lease: 0 });
    expect(calls).toEqual([`upsert:${BOOKING_ID}`, "complete:job-1"]);
  });

  it("löscht den Termin bei Storno", async () => {
    const { deps: d, calls } = deps({ jobs: [job({ event_kind: "delete" })] });
    const res = await runCalendarSync(d);
    expect(res.removed).toBe(1);
    expect(calls[0]).toBe(`delete:${BOOKING_ID}`);
  });

  it("hält Fehler retrybar fest, statt sie zu verschlucken", async () => {
    const { deps: d, calls } = deps({
      jobs: [job()],
      upsertEvent: async () => {
        throw new Error("Kalendereintrag fehlgeschlagen [503]");
      },
    });
    const res = await runCalendarSync(d);
    expect(res).toMatchObject({ failed: 1, synced: 0 });
    expect(calls.some((c) => c.startsWith("fail:job-1"))).toBe(true);
  });

  it("erkennt verlorene Lease (anderer Läufer war schneller)", async () => {
    const { deps: d } = deps({ jobs: [job()], complete: async () => false });
    const res = await runCalendarSync(d);
    expect(res.lost_lease).toBe(1);
  });

  it("ein zweiter Lauf desselben Auftrags nutzt dieselbe Termin-Kennung", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { deps: d } = deps({
        jobs: [job()],
        upsertEvent: async (t, id) => {
          const eid = calendarEventId(t, id);
          ids.push(eid);
          return eid;
        },
      });
      await runCalendarSync(d);
    }
    expect(ids[0]).toBe(ids[1]);
  });
});

describe("calendarBackoffSeconds", () => {
  it("wächst und bleibt begrenzt", () => {
    expect(calendarBackoffSeconds(1)).toBe(300);
    expect(calendarBackoffSeconds(99)).toBe(3600);
  });
});
