import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/active-account", () => ({ requireActiveAccount: {} }));
vi.mock("@tanstack/react-start", () => {
  const chain = { middleware: () => chain, inputValidator: () => chain, handler: (h: unknown) => h };
  return { createServerFn: () => chain };
});
import { validateManualUpsert, type UpsertInput } from "@/lib/manual-reservations.functions";
import { berlinInputToDate, berlinInputFromDate } from "@/lib/berlin-input";

const base: UpsertInput = {
  vehiclePlate: "LEO MY 102",
  startAt: "2026-10-11T07:00:00.000Z",
  endAt: "2026-10-11T16:00:00.000Z",
  customerName: "Test",
  reminderEnabled: true,
  notifyCustomer: false,
  sendConfirmation: false,
  totalPriceCents: 12900,
};

describe("validateManualUpsert (serverseitig)", () => {
  it("Preis Pflicht bei Neuanlage, 0 erlaubt", () => {
    expect(validateManualUpsert({ ...base, totalPriceCents: null })).toMatch(/Gesamtmietpreis/);
    expect(validateManualUpsert({ ...base, totalPriceCents: 0 })).toBeNull();
    expect(validateManualUpsert({ ...base, id: "11111111-1111-4111-8111-111111111111", totalPriceCents: null })).toBeNull();
  });
  it("gültige E-Mail Pflicht bei Bestätigung oder Kunden-Erinnerung", () => {
    expect(validateManualUpsert({ ...base, sendConfirmation: true })).toMatch(/E-Mail/);
    expect(validateManualUpsert({ ...base, notifyCustomer: true, customerEmail: "x@" })).toMatch(/E-Mail/);
    expect(validateManualUpsert({ ...base, sendConfirmation: true, customerEmail: "a@b.de" })).toBeNull();
  });
  it("Ende nach Start", () => {
    expect(validateManualUpsert({ ...base, endAt: base.startAt })).toMatch(/Ende/);
  });
});

describe("Berlin-Eingabe unabhängig von Browser-Zeitzone", () => {
  const original = process.env.TZ;
  for (const tz of ["Asia/Nicosia", "America/New_York", "UTC", "Europe/Berlin"]) {
    it(`gleiche Eingabe in ${tz}`, () => {
      process.env.TZ = tz;
      const r = berlinInputToDate("2026-10-11", "09:00");
      expect(r.ok && r.date.toISOString()).toBe("2026-10-11T07:00:00.000Z");
      const w = berlinInputToDate("2026-12-01", "09:00");
      expect(w.ok && w.date.toISOString()).toBe("2026-12-01T08:00:00.000Z");
      expect(berlinInputFromDate(new Date("2026-10-11T07:00:00Z"))).toEqual({ date: "2026-10-11", time: "09:00" });
      process.env.TZ = original;
    });
  }
  it("Sommerzeit-Lücke und doppelte Stunde werden abgelehnt", () => {
    expect(berlinInputToDate("2026-03-29", "02:30").ok).toBe(false);
    expect(berlinInputToDate("2026-10-25", "02:30").ok).toBe(false);
    expect(berlinInputToDate("2026-02-31", "10:00").ok).toBe(false);
    expect(berlinInputToDate("2026-10-25", "03:30").ok).toBe(true);
  });
});
