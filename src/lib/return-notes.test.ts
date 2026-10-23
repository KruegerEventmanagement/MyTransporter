import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { parseReportInput } from "./trip-return.server";

const base = { bookingId: "11111111-1111-1111-1111-111111111111", endKm: 100, endFuelPercent: null, endKmManual: false, exceptions: {} };

describe("Rückgabe: Sonstiges-Feld", () => {
  it("übernimmt den Freitext gekürzt", () => {
    expect(parseReportInput({ ...base, notes: "  Blinker hinten links defekt " }).notes).toBe("Blinker hinten links defekt");
  });
  it("leerer Text wird null", () => {
    expect(parseReportInput({ ...base, notes: "   " }).notes).toBeNull();
  });
  it("max. 1000 Zeichen", () => {
    expect(parseReportInput({ ...base, notes: "x".repeat(1500) }).notes).toHaveLength(1000);
  });
});
