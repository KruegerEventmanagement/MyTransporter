import { describe, expect, it } from "vitest";
import { calendarStatusView, safeErrorClass, summarizeCalendarState } from "./calendar-status";

const row = (v: number, s: number, extra: Partial<{ synced_at: string; last_error: string }> = {}) => ({
  version: v,
  synced_version: s,
  synced_at: extra.synced_at ?? null,
  last_error: extra.last_error ?? null,
  updated_at: "2026-09-23T20:00:00Z",
});

describe("Kalenderstatus", () => {
  it("fehlende Zugangsdaten → Nicht verbunden, Warnung", () => {
    const v = calendarStatusView(summarizeCalendarState([], false));
    expect(v.headline).toContain("Nicht verbunden");
    expect(v.tone).toBe("warn");
    expect(v.hint).toBeTruthy();
  });

  it("bloß vorhandene Zugangsdaten → nie 'Verbunden', auch mit früherem synced_at", () => {
    const v = calendarStatusView(summarizeCalendarState([row(1, 1, { synced_at: "2026-01-01T00:00:00Z" })], true));
    expect(v.headline).toContain("Zugang eingerichtet, Verbindung noch nicht geprüft");
    expect(v.headline).not.toMatch(/: Verbunden/);
  });

  it("pending > 0 ohne Fehler → trotzdem Warnung mit Rückstand", () => {
    const s = summarizeCalendarState([row(1, 0), row(2, 1), row(3, 3)], true);
    expect(s.pending).toBe(2);
    expect(s.failed).toBe(0);
    const v = calendarStatusView(s);
    expect(v.tone).toBe("warn");
    expect(v.headline).toContain("2 ausstehend");
  });

  it("gibt keine rohen Gateway-Bodies aus", () => {
    const s = summarizeCalendarState(
      [row(1, 0, { last_error: 'Kalender-Update fehlgeschlagen [403]: {"error":{"message":"secret detail"}}' })],
      true,
    );
    expect(s.lastErrorClass).toBe("HTTP 403");
    expect(JSON.stringify(s)).not.toContain("secret detail");
    expect(safeErrorClass("irgendwas mit body")).toBe("Unbekannter Fehler");
  });
});
