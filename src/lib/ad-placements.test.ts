import { describe, expect, it } from "vitest";
import {
  AD_ALLOWED_PATHS,
  getRouteAdPolicy,
  maxPlacementsFor,
  placementSlotFor,
  claimPlacement,
  releasePlacement,
} from "./ad-placements";
import { CMP_ALLOWED_PATHS, isCmpAllowedPath } from "./adsense-cmp";
import { ADSENSE_CONFIG, getSlotId, isAdSenseConfigured, isSlotReady, type AdSenseConfig } from "./adsense";

const LONG = ["/", "/preise", "/faq", "/umzug", "/mietratgeber", "/umzugstransporter-mieten", "/transporter-mieten-pforzheim-calw"];
const AD_FREE = [
  "/werbeflaeche", "/werbung", "/profil", "/admin", "/impressum", "/datenschutz", "/agb", "/reset-password",
  "/auth/confirm", "/checkout/return", "/buchung/abc", "/trip/abc", "/konto-loeschen", "/partner", "/unbekannt",
];

describe("Platzierungsrichtlinie", () => {
  it("lange Seiten: 6 Desktop-Plätze (2 links, 2 rechts, 2 im Inhalt), mobil 2", () => {
    for (const p of LONG) {
      expect(maxPlacementsFor(p, "desktop")).toBe(6);
      expect(maxPlacementsFor(p, "mobile")).toBe(2);
    }
  });

  it("kurze Seiten bekommen weniger", () => {
    expect(maxPlacementsFor("/kontakt", "desktop")).toBe(2);
    expect(maxPlacementsFor("/kontakt", "mobile")).toBe(0);
    expect(placementSlotFor("/kontakt", "inFlowTop", "wide")).toBeNull();
    expect(placementSlotFor("/kontakt", "railLeftLower")).toBeNull();
    expect(maxPlacementsFor("/ueber-uns", "desktop")).toBe(3);
    expect(getRouteAdPolicy("/langzeitmiete")?.railsPerSide).toBe(0);
  });

  it("werbefreie und unbekannte Pfade sind fail-closed (auch für die CMP)", () => {
    for (const p of AD_FREE) {
      expect(getRouteAdPolicy(p)).toBeNull();
      expect(isCmpAllowedPath(p)).toBe(false);
      expect(placementSlotFor(p, "railLeftTop")).toBeNull();
      expect(placementSlotFor(p, "inFlowTop", "mobile")).toBeNull();
    }
    expect(getRouteAdPolicy("/constructor")).toBeNull();
  });

  it("CMP und Anzeigen teilen exakt dieselbe Allowlist", () => {
    expect([...CMP_ALLOWED_PATHS]).toEqual([...AD_ALLOWED_PATHS]);
    expect(isCmpAllowedPath("/preise/")).toBe(true);
  });

  it("mobileTop nur für den oberen Platz auf Handys, nie zweimal im selben Viewport", () => {
    expect(placementSlotFor("/", "inFlowTop", "mobile")).toBe("mobileTop");
    expect(placementSlotFor("/", "inFlowTop", "wide")).toBe("inlineTop");
    expect(placementSlotFor("/", "inFlowBottom", "mobile")).toBe("mobileBottom");
    expect(placementSlotFor("/", "inFlowTop")).toBeNull();
    const a = Symbol("a");
    const b = Symbol("b");
    expect(claimPlacement("inFlowTop", a)).toBe(true);
    expect(claimPlacement("inFlowTop", b)).toBe(false);
    releasePlacement("inFlowTop", a);
    expect(claimPlacement("inFlowTop", b)).toBe(true);
    releasePlacement("inFlowTop", b);
  });
});

describe("Slot-IDs", () => {
  it("echte IDs bleiben, keine neuen erfunden, alle Freigaben aus", () => {
    expect(ADSENSE_CONFIG.slots).toEqual({
      railLeft: "4238348588",
      railRight: "6950298526",
      mobileTop: "7518309544",
      railLeftLower: "6851085973",
      railRightLower: "7070577825",
      inlineTop: "7518309544",
      inlineBottom: "5757496157",
      mobileBottom: "5757496157",
    });
    expect(ADSENSE_CONFIG.enabled || ADSENSE_CONFIG.siteApproved || ADSENSE_CONFIG.certifiedCmpConfigured || ADSENSE_CONFIG.liveCmpVerified || ADSENSE_CONFIG.autoAds).toBe(false);
    for (const k of ["railLeftLower", "railRightLower", "inlineTop", "inlineBottom", "mobileBottom"] as const) {
      expect(getSlotId(k)).not.toBeNull();
    }
  });

  it("fehlende/ungültige neue IDs sperren nur die eigene Platzierung", () => {
    const cfg: AdSenseConfig = {
      ...ADSENSE_CONFIG,
      enabled: true,
      siteApproved: true,
      certifiedCmpConfigured: true,
      liveCmpVerified: true,
      slots: { ...ADSENSE_CONFIG.slots, inlineTop: "", mobileBottom: "abc" },
    };
    expect(isAdSenseConfigured(cfg)).toBe(true);
    expect(isSlotReady("railLeft", cfg)).toBe(true);
    expect(isSlotReady("mobileTop", cfg)).toBe(true);
    expect(isSlotReady("inlineTop", cfg)).toBe(false);
    expect(isSlotReady("mobileBottom", cfg)).toBe(false);
  });
});
