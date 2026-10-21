import { describe, expect, it } from "vitest";
import { isKeyCodeDue, keyHandoverRows } from "./key-handover";

const start = Date.parse("2026-10-20T15:00:00Z"); // 17:00 Berlin
const min = 60_000;

describe("Schlüsselcode 15 Minuten vor Abholung", () => {
  it("nicht vor 16:45", () => expect(isKeyCodeDue(start, start - 16 * min)).toBe(false));
  it("ab 16:45 fällig", () => expect(isKeyCodeDue(start, start - 15 * min)).toBe(true));
  it("nicht lange nach Beginn nachsenden", () => expect(isKeyCodeDue(start, start + 11 * min)).toBe(false));
  it("enthält Code, OBI und Poststraße 60", () => {
    const v = keyHandoverRows("70108680").map((r) => r.value).join(" ");
    expect(v).toContain("70108680");
    expect(v).toContain("OBI Leonberg");
    expect(v).toContain("Poststraße 60");
  });
});

import { keySafeFor, keyHandoverRows as rowsWithSafe } from "./key-handover";
describe("Schlüsseltresor-Zuordnung", () => {
  it("ordnet jedes Fahrzeug seinem Tresor zu", () => {
    expect(keySafeFor("LEO-MY 101")).toBe(1);
    expect(keySafeFor("LEO-MY 102")).toBe(2);
    expect(keySafeFor("PF-MY 1003")).toBe(3);
    expect(keySafeFor("OF-DK 1234")).toBe(4);
    expect(keySafeFor("LEO-MY 104")).toBeNull();
  });
  it("nennt den Tresor in der Code-Mail", () => {
    expect(rowsWithSafe("123", "OF-DK 1234")[0]).toEqual({ label: "Schlüsseltresor", value: "Tresor 4 (für OF-DK 1234)" });
  });
});
