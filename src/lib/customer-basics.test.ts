import { describe, expect, it } from "vitest";
import { checkCustomerBasics, isRealBirthDate } from "./customer-basics";

const NOW = new Date("2026-10-30T12:00:00Z");
const ok = { first_name: "Eva", last_name: "Muster", email: "Eva@Example.com ", birth_date: "1990-05-01", phone: "0171 2345678" };

describe("Pflicht-Stammdaten", () => {
  it("vollständig → ok, Telefon E.164, E-Mail normalisiert", () => {
    const c = checkCustomerBasics(ok, NOW);
    expect(c.ok).toBe(true);
    expect(c.normalized.phone).toBe("+491712345678");
    expect(c.normalized.email).toBe("eva@example.com");
  });
  it("Zypern +357 wird als E.164 akzeptiert", () => {
    expect(checkCustomerBasics({ ...ok, phone: "+357 99 188654" }, NOW).normalized.phone).toBe("+35799188654");
    expect(checkCustomerBasics({ ...ok, phone: "0035799188654" }, NOW).ok).toBe(true);
  });
  it("Festnetz, Nicht-EU, Platzhalter abgelehnt", () => {
    for (const phone of ["07152 12345", "+1 555 123 4567", "0000", "", null, "keine"]) expect(checkCustomerBasics({ ...ok, phone }, NOW).problems.phone).toBeTruthy();
  });
  it("Name nur Leerzeichen/Ziffern abgelehnt", () => {
    expect(checkCustomerBasics({ ...ok, first_name: "   " }, NOW).problems.first_name).toBeTruthy();
    expect(checkCustomerBasics({ ...ok, last_name: "123" }, NOW).problems.last_name).toBeTruthy();
  });
  it("ungültige E-Mail abgelehnt", () => {
    for (const email of ["", "a@b", "kein mail@x.de"]) expect(checkCustomerBasics({ ...ok, email }, NOW).problems.email).toBeTruthy();
  });
  it("Geburtsdatum: echtes Datum, nicht Zukunft, Mindestalter 25", () => {
    expect(isRealBirthDate("1990-02-30", NOW)).toBe(false);
    expect(isRealBirthDate("2030-01-01", NOW)).toBe(false);
    expect(isRealBirthDate("1800-01-01", NOW)).toBe(false);
    expect(checkCustomerBasics({ ...ok, birth_date: "2005-01-01" }, NOW).problems.birth_date).toMatch(/25/);
    expect(checkCustomerBasics({ ...ok, birth_date: "2001-10-30" }, NOW).ok).toBe(true);
  });
});
