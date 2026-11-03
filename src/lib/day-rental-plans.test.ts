import { describe, it, expect } from "vitest";
import { getAvailablePlans, computePlanReturn } from "@/lib/booking-rules";

describe("Tagesmiete: ein angeklickter Tag zeigt auch 24 Stunden", () => {
  it("ein Tag (0 Nächte) liefert 3h, 6h und alle 24h-Tarife", () => {
    const ids = getAvailablePlans(0, 10, "l1h1").map((p) => p.id);
    expect(ids).toEqual(["3h", "6h", "24h_300", "24h_300km", "24h_500", "24h_800"]);
  });
  it("24h ab 18 Uhr bleibt verfügbar, 3h/6h fallen weg", () => {
    const ids = getAvailablePlans(0, 18, "l1h1").map((p) => p.id);
    expect(ids).toContain("24h_300");
    expect(ids).not.toContain("6h");
  });
  it("6h fällt ab 17 Uhr weg, 3h bleibt bis 19 Uhr", () => {
    expect(getAvailablePlans(0, 16, "l1h1").map((p) => p.id)).toContain("6h");
    expect(getAvailablePlans(0, 17, "l1h1").map((p) => p.id)).not.toContain("6h");
  });
  it("24h-Rückgabe am Folgetag zur gleichen Uhrzeit", () => {
    const ret = computePlanReturn("24h_300", new Date(2026, 10, 3), 10);
    expect(ret.getDate()).toBe(4);
    expect(ret.getHours()).toBe(10);
  });
  it("zwei Tage (1 Nacht) liefern weiter nur 24h-Tarife", () => {
    expect(getAvailablePlans(1, 10, "l1h1").map((p) => p.id)).toEqual(["24h_300", "24h_300km", "24h_500", "24h_800"]);
  });
});
