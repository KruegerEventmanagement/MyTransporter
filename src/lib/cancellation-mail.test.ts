import { describe, it, expect } from "vitest";
import { buildCancellationMail, outboxIdempotencyKey } from "./customer-mail-outbox";

const base = { firstName: "Elena", to: "a@b.de", reference: "ABC", vehicle: "L1H1", start: "Mo", end: "Di", refundCents: 5000 };

describe("Stornobestätigung", () => {
  it("nennt Erstattung und enthält keine Gedankenstriche", () => {
    const m = buildCancellationMail(base);
    expect(m.text).toContain("50,00 €");
    expect(m.text).not.toMatch(/[–—]/);
    expect(m.subject).not.toMatch(/[–—]/);
  });
  it("ohne Erstattung kein Erstattungssatz", () => {
    expect(buildCancellationMail({ ...base, refundCents: 0 }).text).not.toContain("Erstattung");
  });
  it("ein fester Schlüssel pro Buchung (keine Doppelmail)", () => {
    expect(outboxIdempotencyKey("booking", "x", "cancellation_confirmation")).toBe(outboxIdempotencyKey("booking", "x", "cancellation_confirmation"));
  });
});
