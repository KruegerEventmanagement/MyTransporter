import { describe, expect, it } from "vitest";
import { formatBookingRange } from "./booking-range";

describe("formatBookingRange", () => {
  it("6h ab 10:00 endet 16:00 am selben Tag", () => {
    const s = formatBookingRange({ start_date: "2026-10-24", start_hour: 10, plan_id: "6h" });
    expect(s).toContain("24.10.2026, 10:00 –");
    expect(s).toContain("24.10.2026, 16:00 Uhr · 6 Std.");
  });
  it("24h ab 09:00 über Zeitumstellung endet Folgetag 08:00 Wanduhr (24 echte Stunden)", () => {
    const s = formatBookingRange({ start_date: "2026-10-24", start_hour: 9, plan_id: "24h" });
    expect(s).toContain("25.10.2026, 08:00 Uhr · 1 Tag");
  });
  it("24h ohne Zeitumstellung endet Folgetag 09:00", () => {
    expect(formatBookingRange({ start_date: "2026-10-27", start_hour: 9, plan_id: "24h" })).toContain("28.10.2026, 09:00 Uhr");
  });
});
