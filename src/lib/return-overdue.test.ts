import { describe, it, expect } from "vitest";
import { overdueStageDue } from "./return-notice";
const end = Date.UTC(2026, 9, 21, 15, 0);
const m = 60_000;
describe("Nachfass-Stufen nach Mietende", () => {
  it("vor 30 min nach Ende: keine Mail", () => expect(overdueStageDue(end + 29 * m, end)).toBeNull());
  it("ab 30 min: Stufe 1", () => expect(overdueStageDue(end + 30 * m, end)).toBe("return_overdue_1"));
  it("ab 3 h: letzte Erinnerung", () => expect(overdueStageDue(end + 180 * m, end)).toBe("return_overdue_2"));
  it("nach 24 h: nichts mehr", () => expect(overdueStageDue(end + 24 * 60 * m, end)).toBeNull());
  it("vor Mietende: nichts", () => expect(overdueStageDue(end - m, end)).toBeNull());
});
