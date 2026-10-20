import { describe, expect, it } from "vitest";
import { pickupKeyDecision } from "./pickup-key.server";

// 20.10.2026 17:00 Berlin (Sommerzeit) = 15:00 UTC
const row = { user_id: "u1", status: "paid", start_date: "2026-10-20", start_hour: 17 };
const at = (iso: string) => new Date(iso).getTime();

describe("Schlüsselcode in der App", () => {
  it("vor 16:45 gesperrt", () => {
    expect(pickupKeyDecision(row, "u1", at("2026-10-20T14:44:00Z")).state).toBe("locked");
  });
  it("ab 16:45 freigegeben", () => {
    expect(pickupKeyDecision(row, "u1", at("2026-10-20T14:45:00Z")).state).toBe("due");
  });
  it("fremde Buchung nie", () => {
    expect(pickupKeyDecision(row, "u2", at("2026-10-20T15:00:00Z")).state).toBe("unavailable");
  });
  it("stornierte Buchung nie", () => {
    expect(pickupKeyDecision({ ...row, status: "cancelled" }, "u1", at("2026-10-20T15:00:00Z")).state).toBe("unavailable");
  });
});
