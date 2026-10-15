import { describe, it, expect } from "vitest";
import { returnPopupPhase, returnMailDue, DEPOSIT_RETURN_NOTICE } from "./return-notice";

const end = Date.UTC(2026, 9, 25, 9, 0); // DST-Wechseltag
const M = 60_000;
describe("Rückgabe-Hinweis", () => {
  it("Pop-up ab 60 min vor Ende, danach überfällig, nie bei laufender Rückgabe", () => {
    expect(returnPopupPhase(end - 61 * M, end, false)).toBeNull();
    expect(returnPopupPhase(end - 60 * M, end, false)).toBe("soon");
    expect(returnPopupPhase(end, end, false)).toBe("overdue");
    expect(returnPopupPhase(end, end, true)).toBeNull();
  });
  it("Mail nur im Fenster Ende−60 min bis Ende", () => {
    expect(returnMailDue(end - 61 * M, end)).toBe(false);
    expect(returnMailDue(end - 60 * M, end)).toBe(true);
    expect(returnMailDue(end, end)).toBe(false);
  });
  it("Text nennt 10 Werktage und 30 €", () => {
    expect(DEPOSIT_RETURN_NOTICE).toContain("bis zu 10 Werktage");
    expect(DEPOSIT_RETURN_NOTICE).toContain("30 €");
  });
});
