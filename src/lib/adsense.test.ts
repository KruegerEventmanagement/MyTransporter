import { describe, expect, it } from "vitest";
import {
  ADSENSE_CONFIG,
  getSlotId,
  isAdSenseConfigured,
  isSlotReady,
  isValidPublisherId,
  isValidSlotId,
  validateAdSenseConfig,
  type AdSenseConfig,
} from "./adsense";

const validConfig: AdSenseConfig = {
  enabled: true,
  publisherId: "ca-pub-1234567890123456",
  slots: { railLeft: "1234567890", railRight: "0987654321" },
  autoAds: false,
  siteApproved: true,
  certifiedCmpConfigured: true,
};

describe("AdSense-Konfiguration", () => {
  it("ist standardmäßig deaktiviert, Publisher- und echte Slot-IDs hinterlegt", () => {
    expect(ADSENSE_CONFIG.enabled).toBe(false);
    expect(ADSENSE_CONFIG.publisherId).toBe("ca-pub-6974851907377988");
    expect(isValidPublisherId(ADSENSE_CONFIG.publisherId)).toBe(true);
    expect(ADSENSE_CONFIG.slots.railLeft).toBe("4238348588");
    expect(ADSENSE_CONFIG.slots.railRight).toBe("6950298526");
    expect(ADSENSE_CONFIG.slots.inlineContent).toBeUndefined();
    expect(ADSENSE_CONFIG.autoAds).toBe(false);
    expect(ADSENSE_CONFIG.siteApproved).toBe(false);
    expect(ADSENSE_CONFIG.certifiedCmpConfigured).toBe(false);
    expect(isAdSenseConfigured()).toBe(false);
    expect(isSlotReady("railLeft")).toBe(false);
    expect(getSlotId("railLeft")).toBe("4238348588");
    expect(getSlotId("inlineContent")).toBeNull();
  });

  it("meldet alle fehlenden Voraussetzungen", () => {
    const problems = validateAdSenseConfig();
    expect(problems.length).toBeGreaterThanOrEqual(3);
    expect(problems.some((p) => p.includes("deaktiviert"))).toBe(true);
    expect(problems.some((p) => p.includes("freigegeben"))).toBe(true);
    expect(problems.some((p) => p.includes("CMP"))).toBe(true);
  });

  it("validiert Publisher- und Slot-IDs streng", () => {
    expect(isValidPublisherId("ca-pub-1234567890123456")).toBe(true);
    expect(isValidPublisherId("ca-pub-123")).toBe(false);
    expect(isValidPublisherId("pub-1234567890123456")).toBe(false);
    expect(isValidSlotId("1234567890")).toBe(true);
    expect(isValidSlotId("abc")).toBe(false);
    expect(isValidSlotId(undefined)).toBe(false);
  });

  it("akzeptiert nur vollständig gültige Konfiguration", () => {
    expect(isAdSenseConfigured(validConfig)).toBe(true);
    expect(isSlotReady("railLeft", validConfig)).toBe(true);
    expect(isSlotReady("inlineContent", validConfig)).toBe(false);
  });

  it("bleibt fail-closed bei fehlender Freigabe oder CMP", () => {
    expect(isAdSenseConfigured({ ...validConfig, siteApproved: false })).toBe(false);
    expect(isAdSenseConfigured({ ...validConfig, certifiedCmpConfigured: false })).toBe(false);
    expect(isAdSenseConfigured({ ...validConfig, enabled: false })).toBe(false);
    expect(isAdSenseConfigured({ ...validConfig, publisherId: "" })).toBe(false);
    expect(isAdSenseConfigured({ ...validConfig, slots: { railLeft: "abc" } })).toBe(false);
  });
});
