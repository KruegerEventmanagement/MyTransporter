import { describe, it, expect } from "vitest";
import { MESSAGES, LANGS } from "./messages";
import { HOW_COPY } from "../how-it-works-i18n";

describe("Übersetzungen", () => {
  it("bietet genau die 7 gewünschten Sprachen an", () => {
    expect(LANGS.map((l) => l.code)).toEqual(["de", "en", "ru", "ar", "tr", "it", "el"]);
  });
  it("jede Sprache hat alle Texte und die Anleitung hat 8 Schritte", () => {
    const keys = Object.keys(MESSAGES.de).sort();
    for (const { code } of LANGS) {
      expect(Object.keys(MESSAGES[code]).sort()).toEqual(keys);
      for (const v of Object.values(MESSAGES[code])) expect(v.trim()).not.toBe("");
      expect(HOW_COPY[code].steps).toHaveLength(8);
      expect(JSON.stringify(HOW_COPY[code])).toContain("30");
    }
  });
});
