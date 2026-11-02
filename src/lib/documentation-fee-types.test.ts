import { describe, it, expect } from "vitest";
import { classifyDocumentationGaps, exceptionKind } from "./documentation-fee";
describe("return_exceptions mit Nicht-Text-Werten", () => {
  it("stürzt bei refueled:true nicht ab", () => {
    const r = classifyDocumentationGaps({ flow: "v2", refueled: true } as Record<string, unknown>);
    expect(r.notProvided).toEqual([]);
    expect(r.technical).toEqual([]);
    expect(exceptionKind(true)).toBeNull();
  });
});
