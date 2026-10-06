import { describe, it, expect, vi } from "vitest";
import {
  passwordResetRedirect,
  requestPasswordReset,
  parseRecoveryUrl,
  validateNewPassword,
  NEUTRAL_RESET_MESSAGE,
} from "./password-reset";

describe("sichere Callback-URL", () => {
  it("Live-Domains bleiben, localhost/App-Shell/fremde Hosts -> kanonisch", () => {
    expect(passwordResetRedirect("https://www.mytransporter.org")).toBe("https://www.mytransporter.org/reset-password");
    expect(passwordResetRedirect("http://localhost:8080")).toBe("https://mytransporter.org/reset-password");
    expect(passwordResetRedirect("capacitor://localhost")).toBe("https://mytransporter.org/reset-password");
    expect(passwordResetRedirect("https://localhost")).toBe("https://mytransporter.org/reset-password");
    expect(passwordResetRedirect("https://evil.example")).toBe("https://mytransporter.org/reset-password");
    expect(passwordResetRedirect(null)).toBe("https://mytransporter.org/reset-password");
  });
});

describe("Link anfordern (simuliert)", () => {
  it("neutrale Bestätigung auch bei unbekannter Adresse, Redirect kanonisch", async () => {
    const reset = vi.fn().mockResolvedValue({ error: { status: 400, message: "User not found" } });
    const r = await requestPasswordReset({ auth: { resetPasswordForEmail: reset } }, " Max@Example.de ", "capacitor://localhost");
    expect(r).toEqual({ ok: true, message: NEUTRAL_RESET_MESSAGE });
    expect(reset).toHaveBeenCalledWith("max@example.de", { redirectTo: "https://mytransporter.org/reset-password" });
  });
  it("Ratenlimit verständlich", async () => {
    const reset = vi.fn().mockResolvedValue({ error: { status: 429, message: "email rate limit exceeded" } });
    const r = await requestPasswordReset({ auth: { resetPasswordForEmail: reset } }, "a@b.de", null);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Zu viele Anfragen/);
  });
  it("ungültige Adresse ohne Anfrage", async () => {
    const reset = vi.fn();
    const r = await requestPasswordReset({ auth: { resetPasswordForEmail: reset } }, "kein-mail", null);
    expect(r.ok).toBe(false);
    expect(reset).not.toHaveBeenCalled();
  });
});

describe("Recovery-Link erkennen", () => {
  it("gültige Varianten", () => {
    expect(parseRecoveryUrl("https://mytransporter.org/reset-password?code=abc").kind).toBe("code");
    expect(parseRecoveryUrl("https://mytransporter.org/reset-password?token_hash=x&type=recovery").kind).toBe("token_hash");
    expect(parseRecoveryUrl("https://mytransporter.org/reset-password#access_token=t&type=recovery").kind).toBe("implicit");
  });
  it("abgelaufen/ungültig", () => {
    expect(parseRecoveryUrl("https://mytransporter.org/reset-password#error=access_denied&error_code=otp_expired")).toEqual({ kind: "error", expired: true });
    expect(parseRecoveryUrl("https://mytransporter.org/reset-password").kind).toBe("none");
    // normale Sitzung ohne type=recovery berechtigt nicht zum Setzen
    expect(parseRecoveryUrl("https://mytransporter.org/reset-password#access_token=t&type=signup").kind).toBe("none");
  });
  it("Passwortregeln", () => {
    expect(validateNewPassword("12345", "12345")).toMatch(/6 Zeichen/);
    expect(validateNewPassword("123456", "123457")).toMatch(/nicht überein/);
    expect(validateNewPassword("123456", "123456")).toBeNull();
  });
});
