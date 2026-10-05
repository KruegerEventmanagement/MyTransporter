import { describe, expect, it } from "vitest";
import { pickActiveTrip, isTripPath, phaseFor, type ActiveTripRow } from "./active-trip";
import { resolveTripWindow, returnTimeState, msUntilReminder, formatBerlin } from "./trip-time";
import { dueReturnReminders } from "./return-reminder";
import { rankRoutes, createRequestGate } from "./trip-routes";

const row = (o: Partial<ActiveTripRow>): ActiveTripRow => ({
  id: "b1",
  user_id: "u1",
  status: "active",
  start_date: "2026-10-08",
  start_hour: 10,
  plan_id: "24h",
  ...o,
});

describe("Zeit-Resolver (Europe/Berlin, Spiegel von plan_end_at)", () => {
  it("24h im Sommer: Start 10:00 Berlin = 08:00 UTC", () => {
    const w = resolveTripWindow(row({}));
    expect(new Date(w.startMs).toISOString()).toBe("2026-10-08T08:00:00.000Z");
    expect(w.endMs - w.startMs).toBe(24 * 3600_000);
  });
  it("Zeitumstellung 25.10.: +24h echte Stunden (wie timestamptz + interval)", () => {
    const w = resolveTripWindow(row({ start_date: "2026-10-24", start_hour: 10 }));
    expect(new Date(w.startMs).toISOString()).toBe("2026-10-24T08:00:00.000Z");
    expect(formatBerlin(w.endMs)).toContain("09:00");
  });
  it("km-Tarif endet 22:00 Berlin, Wochenpaket und unbekannter Tarif", () => {
    expect(formatBerlin(resolveTripWindow(row({ plan_id: "km" })).endMs)).toContain("22:00");
    const wk = resolveTripWindow(row({ plan_id: "week_x2" }));
    expect(wk.endMs - wk.startMs).toBe(2 * 168 * 3600_000);
    const unk = resolveTripWindow(row({ plan_id: "xyz" }));
    expect(unk.endMs - unk.startMs).toBe(24 * 3600_000);
    const m3 = resolveTripWindow(row({ plan_id: "multi_3d" }));
    expect(m3.endMs - m3.startMs).toBe(72 * 3600_000);
  });
  it("10-Minuten-Erinnerung: früh, fällig, verspätet", () => {
    const end = 1_000_000_000;
    expect(returnTimeState(end - 11 * 60_000, end)).toBe("running");
    expect(msUntilReminder(end - 11 * 60_000, end)).toBe(60_000);
    expect(returnTimeState(end - 600_000, end)).toBe("reminder");
    expect(returnTimeState(end + 1, end)).toBe("overdue");
    expect(msUntilReminder(end + 5, end)).toBe(0);
  });
});

describe("Aktive Miete", () => {
  it("nur eigene, aktive; Fremdkonto, cancelled, completed, paid ausgeschlossen", () => {
    const rows = [
      row({ id: "x", user_id: "fremd" }),
      row({ id: "c", status: "cancelled" }),
      row({ id: "d", status: "completed" }),
      row({ id: "p", status: "paid" }),
    ];
    expect(pickActiveTrip(rows, "u1")).toBeNull();
    expect(pickActiveTrip([row({})], null)).toBeNull();
  });
  it("mehrere: geöffnete ID hat Vorrang, sonst früheres Ende", () => {
    const rows = [row({ id: "late", start_date: "2026-10-09" }), row({ id: "early" }), row({ id: "ret", status: "returning", start_date: "2026-10-10" })];
    expect(pickActiveTrip(rows, "u1")?.id).toBe("early");
    expect(pickActiveTrip(rows, "u1", "ret")?.returning).toBe(true);
    expect(pickActiveTrip(rows, "u1", "unbekannt")?.id).toBe("early");
  });
  it("Leiste nicht in der Fahrtansicht", () => {
    expect(isTripPath("/trip/abc")).toBe(true);
    expect(isTripPath("/preise")).toBe(false);
  });
  it("Phase aus Serverstatus; Rückgabeentwurf hält return; returning bleibt return", () => {
    expect(phaseFor("active", false)).toBe("active");
    expect(phaseFor("active", true)).toBe("return");
    expect(phaseFor("returning", false)).toBe("return");
    expect(phaseFor("paid", true)).toBe("pre");
    expect(phaseFor("cancelled", true)).toBe("done");
  });
});

describe("Push-Erinnerung (Cron 15 min)", () => {
  const r = { id: "b1", user_id: "u1", status: "active", start_date: "2026-10-08", start_hour: 10, plan_id: "6h", return_reminder_10min_for: null };
  const end = resolveTripWindow(r).endMs;
  it("zu früh nicht, im Fenster ja, schon erinnert nein, Endzeit geändert erneut", () => {
    expect(dueReturnReminders([r], end - 11 * 60_000)).toHaveLength(0);
    const due = dueReturnReminders([r], end - 10 * 60_000);
    expect(due).toHaveLength(1);
    expect(due[0]!.endIso).toBe(new Date(end).toISOString());
    expect(dueReturnReminders([{ ...r, return_reminder_10min_for: new Date(end).toISOString() }], end - 5 * 60_000)).toHaveLength(0);
    expect(
      dueReturnReminders([{ ...r, plan_id: "24h", return_reminder_10min_for: new Date(end).toISOString() }], resolveTripWindow({ ...r, plan_id: "24h" }).endMs - 5 * 60_000),
    ).toHaveLength(1);
    expect(dueReturnReminders([{ ...r, status: "returning" }], end - 5 * 60_000)).toHaveLength(0);
    expect(dueReturnReminders([r], end + 31 * 60_000)).toHaveLength(0);
  });
});

describe("Routen", () => {
  it("sortiert nach Dauer, behält Originalindex", () => {
    const alts = rankRoutes([
      { legs: [{ duration: { value: 900, text: "15" }, distance: { value: 1, text: "a" } }] },
      { legs: [{ duration: { value: 600, text: "10" }, distance: { value: 2, text: "b" } }] },
      { legs: [{ duration: { value: 700, text: "11" }, distance: { value: 3, text: "c" } }] },
    ]);
    expect(alts.map((a) => a.originalIndex)).toEqual([1, 2, 0]);
  });
  it("Gate verwirft veraltete Antworten", () => {
    const g = createRequestGate();
    const a = g.next();
    const b = g.next();
    expect(g.isCurrent(a)).toBe(false);
    expect(g.isCurrent(b)).toBe(true);
    g.invalidate();
    expect(g.isCurrent(b)).toBe(false);
  });
});

describe("Stichtag für Pflicht-Abschluss", async () => {
  const { isLegacyOpenTrip, pickActiveTrip: pick, TRIP_COMPLETION_REQUIRED_FROM } = await import("./active-trip");
  const { dueReturnReminders } = await import("./return-reminder");
  const base = { user_id: "u1", start_hour: 10, plan_id: "24h" };
  it("offene Altbuchungen vor dem Stichtag verfallen, ab Stichtag nicht", () => {
    expect(TRIP_COMPLETION_REQUIRED_FROM).toBe("2026-10-06");
    expect(isLegacyOpenTrip({ status: "active", start_date: "2026-05-20" })).toBe(true);
    expect(isLegacyOpenTrip({ status: "returning", start_date: "2026-10-05" })).toBe(true);
    expect(isLegacyOpenTrip({ status: "active", start_date: "2026-10-06" })).toBe(false);
    expect(isLegacyOpenTrip({ status: "completed", start_date: "2026-05-20" })).toBe(false);
    expect(isLegacyOpenTrip({ status: "cancelled", start_date: "2026-05-20" })).toBe(false);
  });
  it("Banner-Auswahl ignoriert Altbuchungen", () => {
    const rows = [
      { ...base, id: "mai", status: "active", start_date: "2026-05-20" },
      { ...base, id: "mai-r", status: "returning", start_date: "2026-05-26" },
    ];
    expect(pick(rows, "u1")).toBeNull();
    expect(pick(rows, "u1", "mai")).toBeNull();
    expect(pick([...rows, { ...base, id: "neu", status: "active", start_date: "2026-10-06" }], "u1")?.id).toBe("neu");
  });
  it("keine Rückgabe-Erinnerung für Altbuchungen", () => {
    const r = { ...base, id: "mai", status: "active", start_date: "2026-05-20", return_reminder_10min_for: null };
    const end = Date.parse("2026-05-21T08:00:00Z");
    expect(dueReturnReminders([r], end - 5 * 60_000)).toHaveLength(0);
  });
});
