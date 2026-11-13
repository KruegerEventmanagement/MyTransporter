import { describe, expect, it } from "vitest";
import { authErrorMessage, normalizeEmail, suggestsPasswordReset } from "./auth-input";

describe("suggestsPasswordReset", () => {
  it("bietet Reset bei falschem Passwort an", () => {
    expect(suggestsPasswordReset(authErrorMessage("Invalid login credentials"))).toBe(true);
  });
  it("bietet Reset bei bereits registrierter E-Mail an", () => {
    expect(suggestsPasswordReset("Diese E-Mail ist bereits registriert. Bitte melde dich mit deinem Passwort an.")).toBe(true);
  });
  it("bietet keinen Reset bei Netzwerkfehlern an", () => {
    expect(suggestsPasswordReset(authErrorMessage("Failed to fetch"))).toBe(false);
  });
});

describe("auth-input", () => {
  it("entfernt Leerzeichen und Großbuchstaben aus der E-Mail", () => {
    expect(normalizeEmail(" Samira.Aay@Proton.me ")).toBe("samira.aay@proton.me");
  });
  it("übersetzt falsche Zugangsdaten ins Deutsche", () => {
    expect(authErrorMessage("Invalid login credentials")).toMatch(/E-Mail oder Passwort stimmt nicht/);
  });
  it("übersetzt unbestätigte E-Mail", () => {
    expect(authErrorMessage("Email not confirmed")).toMatch(/bestätige/);
  });
});

import { runAuthCall as _run } from "./auth-input";
describe("runAuthCall", () => {
  it("bricht hängende Anmeldung nach Zeitlimit mit Verbindungsmeldung ab", async () => {
    const r = await _run(() => new Promise<never>(() => {}), 20);
    expect(authErrorMessage(r.error?.message)).toMatch(/Keine Verbindung/);
  });
  it("fängt Absturz ab statt endlos zu laden", async () => {
    const r = await _run(() => Promise.reject(new TypeError("Failed to fetch")), 1000);
    expect(authErrorMessage(r.error?.message)).toMatch(/Keine Verbindung/);
  });
});
