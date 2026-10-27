import { describe, it, expect } from "vitest";
import { withRetryTimeout } from "./BookingSection";

describe("Verfügbarkeitsabfrage Zeitlimit", () => {
  it("hängende Abfrage endet nach Zeitlimit mit Fehler statt Dauer-Laden", async () => {
    let calls = 0;
    await expect(withRetryTimeout(() => { calls++; return new Promise(() => {}); }, 20, 2)).rejects.toThrow("Zeitüberschreitung");
    expect(calls).toBe(2);
  });
  it("zweiter Versuch liefert Ergebnis", async () => {
    let calls = 0;
    const r = await withRetryTimeout(() => (++calls === 1 ? new Promise<number>(() => {}) : Promise.resolve(7)), 20, 2);
    expect(r).toBe(7);
  });
});
