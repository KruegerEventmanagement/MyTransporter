import { describe, expect, it } from "vitest";
import { authErrorMessage, normalizeEmail } from "./auth-input";

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
