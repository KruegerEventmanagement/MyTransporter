import { describe, expect, it } from "vitest";
import { isHalloweenActive } from "./halloween";

describe("Halloween-Aktion", () => {
  it("läuft bis einschließlich 7. November und endet danach", () => {
    expect(isHalloweenActive(Date.parse("2026-10-31T20:00:00+01:00"))).toBe(true);
    expect(isHalloweenActive(Date.parse("2026-11-07T23:59:00+01:00"))).toBe(true);
    expect(isHalloweenActive(Date.parse("2026-11-08T00:00:00+01:00"))).toBe(false);
    expect(isHalloweenActive(Date.parse("2026-10-28T12:00:00+01:00"))).toBe(false);
  });
});
