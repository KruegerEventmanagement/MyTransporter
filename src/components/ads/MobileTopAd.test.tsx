// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ADSENSE_CONFIG, isSlotReady } from "@/lib/adsense";
import { MobileTopAd } from "./MobileTopAd";
import { AdSlot } from "./AdSlot";

afterEach(() => cleanup());

describe("AdSense-Vorbereitung (keine echten Anzeigenabrufe)", () => {
  it("echte IDs bleiben erhalten, Flags aus, echte mobile Slot-ID eingetragen", () => {
    expect(ADSENSE_CONFIG.publisherId).toBe("ca-pub-6974851907377988");
    expect(ADSENSE_CONFIG.slots.railLeft).toBe("4238348588");
    expect(ADSENSE_CONFIG.slots.railRight).toBe("6950298526");
    expect(ADSENSE_CONFIG.slots.mobileTop).toBe("7518309544");
    expect(ADSENSE_CONFIG.enabled || ADSENSE_CONFIG.siteApproved || ADSENSE_CONFIG.certifiedCmpConfigured || ADSENSE_CONFIG.liveCmpVerified).toBe(false);
    expect(isSlotReady("mobileTop")).toBe(false);
  });

  it("mobiler Banner rendert nichts und lädt keine Scripts bei deaktivierter Konfiguration", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} }) as never;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(<MobileTopAd />);
    expect(container.innerHTML).toBe("");
    expect(document.querySelectorAll("script, ins").length).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Desktop-Slots rendern ohne Konfiguration/Einwilligung nichts", () => {
    const { container } = render(<AdSlot slot="railLeft" />);
    expect(container.querySelector("ins")).toBeNull();
  });
});
