// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

/* Simuliert: Freigabe/Consent/Native/Viewport sind gemockt, es gibt keinen echten Netzwerkverkehr. */
const env = { ready: true, consented: true, native: false, mobile: false, wide: true };

vi.mock("@/lib/adsense", async (orig) => {
  const real = await orig<typeof import("@/lib/adsense")>();
  return {
    ...real,
    isSlotReady: (key: string) => env.ready && !!real.ADSENSE_CONFIG.slots[key as "railLeft"] ||
      (env.ready && ["inlineTop", "inlineBottom", "mobileBottom", "railLeftLower", "railRightLower"].includes(key)),
    getSlotId: (key: string) => real.ADSENSE_CONFIG.slots[key as "railLeft"] ?? "1111111111",
  };
});
vi.mock("@/lib/native/platform", () => ({ isNativeApp: () => env.native }));
vi.mock("./useAdCmp", () => ({ useAdConsentGranted: () => env.consented, useAdCmpBootstrap: () => {} }));
vi.mock("@/lib/adsense-cmp", () => ({ areAdRequestsAllowed: () => true }));
const ensure = vi.fn(async () => false);
vi.mock("./adsense-loader", () => ({ ensureAdSenseScript: ensure, adRequestsCurrentlyPermitted: () => false }));

const { InFlowAd } = await import("./InFlowAd");
const { setAdsSuppressed } = await import("@/lib/ad-visibility");

function setPath(path: string) {
  window.history.replaceState(null, "", path);
}

beforeEach(() => {
  Object.assign(env, { ready: true, consented: true, native: false, mobile: false, wide: true });
  setAdsSuppressed(false);
  window.matchMedia = vi.fn((q: string) => ({
    matches: q.includes("max-width: 767px") ? env.mobile : q.includes("min-width: 768px") ? env.wide : false,
    addEventListener() {},
    removeEventListener() {},
  })) as never;
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
  setPath("/");
});
afterEach(() => cleanup());

const page = () => (
  <>
    <InFlowAd placement="inFlowTop" />
    <InFlowAd placement="inFlowBottom" />
  </>
);

describe("InFlowAd (Mock-gated)", () => {
  it("Desktop auf langer Seite: 2 In-Flow-Plätze mit Inline-Einheiten", () => {
    setPath("/umzug");
    const { container } = render(page());
    expect(container.querySelectorAll("ins").length).toBe(2);
    expect(container.querySelector("[data-testid=ad-inFlowTop] ins")?.getAttribute("data-ad-slot")).toBe("7518309544");
  });

  it("390 px mobil: oben mobileTop, unten zweiter Mobilplatz, keine Desktop-Einheit", () => {
    Object.assign(env, { mobile: true, wide: false });
    const { container } = render(page());
    const slots = [...container.querySelectorAll("ins")].map((i) => i.getAttribute("data-ad-slot"));
    expect(slots).toEqual(["7518309544", "5757496157"]);
  });

  it("kurze Seite /langzeitmiete: nur ein Platz", () => {
    setPath("/langzeitmiete");
    expect(render(page()).container.querySelectorAll("ins").length).toBe(1);
  });

  it("kein Platz auf /kontakt, /werbeflaeche, /profil oder unbekannten Pfaden", () => {
    for (const p of ["/kontakt", "/werbeflaeche", "/profil", "/xyz"]) {
      setPath(p);
      expect(render(page()).container.querySelectorAll("ins").length).toBe(0);
      cleanup();
    }
  });

  it("nichts ohne Einwilligung, bei deaktivierter Konfiguration, nativ oder ohne passenden Viewport", () => {
    for (const patch of [{ consented: false }, { ready: false }, { native: true }, { mobile: false, wide: false }]) {
      Object.assign(env, { ready: true, consented: true, native: false, mobile: false, wide: true }, patch);
      expect(render(page()).container.querySelectorAll("ins").length).toBe(0);
      cleanup();
    }
    expect(ensure).not.toHaveBeenCalled();
  });

  it("Unterdrückung (Buchungsschritt) blendet sofort aus", () => {
    const { container } = render(page());
    expect(container.querySelectorAll("ins").length).toBe(2);
    act(() => setAdsSuppressed(true));
    expect(container.querySelectorAll("ins").length).toBe(0);
  });

  it("derselbe logische Platz wird nie doppelt gerendert", () => {
    const { container } = render(
      <>
        <InFlowAd placement="inFlowTop" />
        <InFlowAd placement="inFlowTop" />
      </>,
    );
    expect(container.querySelectorAll("ins").length).toBe(1);
  });
});
