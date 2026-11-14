import { describe, it, expect } from "vitest";
import { isFeedbackExcluded } from "./feedback-exclusions";

describe("Bewertungsmail-Sperrliste", () => {
  it("sperrt Moein Baghery", () => expect(isFeedbackExcluded(" Moein.Baghery@gmail.com ")).toBe(true));
  it("sperrt Ante Mihalj", () => expect(isFeedbackExcluded("ante.mihalj@live.com")).toBe(true));
  it("sperrt Rainer weiterhin", () => expect(isFeedbackExcluded("rainerrene11@web.de")).toBe(true));
  it("lässt andere Kunden durch", () => expect(isFeedbackExcluded("kunde@example.com")).toBe(false));
});
