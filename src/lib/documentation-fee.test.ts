import { describe, expect, it } from "vitest";
import {
  DOCUMENTATION_FEE_NOTICE,
  classifyDocumentationGaps,
  exceptionKind,
  stripExceptionKind,
  withExceptionKind,
} from "./documentation-fee";
import { cleanExceptions, validReason } from "./trip-return";

describe("Bearbeitungspauschale für fehlende Fahrzeugdokumentation", () => {
  it("Wortlaut exakt, keine Abbuchungsbehauptung", () => {
    expect(DOCUMENTATION_FEE_NOTICE).toBe(
      "Bei fehlenden oder nicht verwertbaren Pflichtfotos entsteht zusätzlicher manueller Prüf- und Bearbeitungsaufwand. Hierfür wird eine Bearbeitungspauschale von 30 € berechnet.",
    );
    expect(DOCUMENTATION_FEE_NOTICE).not.toMatch(/automatisch|abgebucht|eingezogen/i);
  });

  it("technische Fehler sind nie Pauschalen-Kandidat, nichts wird automatisch belastet", () => {
    const r = classifyDocumentationGaps({
      photos: withExceptionKind("technical", "Galerie öffnet sich nicht"),
      fuel: withExceptionKind("technical", "Upload bricht ab, kein Netz"),
    });
    expect(r.technical).toEqual(["photos", "fuel"]);
    expect(r.feeReviewCandidate).toBe(false);
    expect(r.autoCharge).toBe(false);
  });

  it("bewusst nicht bereitgestellt → nur Prüfkandidat, weiterhin autoCharge false", () => {
    const r = classifyDocumentationGaps({ receipt: withExceptionKind("not_provided", "Beleg weggeworfen") });
    expect(r.notProvided).toEqual(["receipt"]);
    expect(r.feeReviewCandidate).toBe(true);
    expect(r.autoCharge).toBe(false);
  });

  it("Altfälle ohne Kennung bleiben unklassifiziert (kein Pauschalen-Kandidat)", () => {
    const r = classifyDocumentationGaps({ fuel: "Anzeige ist dunkel und unlesbar" });
    expect(r.unclassified).toEqual(["fuel"]);
    expect(r.feeReviewCandidate).toBe(false);
  });

  it("Kennung wechselbar, Begründung bleibt; Kennung allein zählt nicht als Begründung", () => {
    const a = withExceptionKind("technical", "Kamera zeigt schwarz");
    const b = withExceptionKind("not_provided", a);
    expect(exceptionKind(b)).toBe("not_provided");
    expect(stripExceptionKind(b)).toBe("Kamera zeigt schwarz");
    expect(validReason(withExceptionKind("technical", ""))).toBe(false);
    expect(validReason(b)).toBe(true);
    expect(cleanExceptions({ photos: withExceptionKind("technical", "kurz") })).toEqual({});
  });
});
