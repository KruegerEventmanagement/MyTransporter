import { describe, it, expect } from "vitest";
import { buildKeySms, normalizePhone, KEY_SMS_SENDER } from "./key-sms";

describe("Schlüsselcode-SMS", () => {
  it("nennt Box und Code passend zum Fahrzeug", () => {
    const t = buildKeySms("PF MY 1003", "4711")!;
    expect(t).toContain("Box 3");
    expect(t).toContain("Code: 4711");
    expect(t).toContain("PF MY 1003");
    expect(t).toContain("mindestens 30 €");
  });
  it("ohne Tresor oder Code keine SMS", () => {
    expect(buildKeySms("LEO MY 104", "1")).toBeNull();
    expect(buildKeySms("LEO MY 101", "")).toBeNull();
  });
  it("Absender max. 11 Zeichen", () => expect(KEY_SMS_SENDER.length).toBeLessThanOrEqual(11));
  it("normalisiert deutsche Handynummern", () => {
    expect(normalizePhone("0171 234 5678")).toBe("+491712345678");
    expect(normalizePhone("0049 171-2345678")).toBe("+491712345678");
  });
  it("lehnt Festnetz, Nicht-EU und Unsinn ab", () => {
    expect(normalizePhone("07152 12345")).toBeNull();
    expect(normalizePhone("+1 555 123 4567")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});
