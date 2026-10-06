// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

/* Mock-gated: keine echten Anzeigen-/Script-Anfragen. */
const env = { consented: true };
let contentHeight = 3000;
vi.mock("@/components/ads/useAdPathname", async () => ({ useAdPathname: (await import("@/test/ad-pathname-mock")).useAdPathnameMock }));
vi.mock("@/lib/native/platform", () => ({ isNativeApp: () => false }));
vi.mock("./useAdCmp", () => ({ useAdConsentGranted: () => env.consented, useAdCmpBootstrap: vi.fn() }));
vi.mock("@/lib/adsense", async (orig) => {
  const real = await orig<typeof import("@/lib/adsense")>();
  return { ...real, isSlotReady: () => true, getSlotId: (k: "railLeft") => real.ADSENSE_CONFIG.slots[k] ?? null };
});
vi.mock("@/lib/adsense-cmp", () => ({ areAdRequestsAllowed: () => true, lastAdConsentEvaluation: () => ({ consented: true }) }));
const ensure = vi.fn(async () => true);
const permitted = vi.fn(() => true);
vi.mock("./adsense-loader", () => ({ ensureAdSenseScript: ensure, adRequestsCurrentlyPermitted: permitted }));

const { AdRails } = await import("./AdRails");
const { navigateAdPath } = await import("@/test/ad-pathname-mock");
const { setAdsSuppressed } = await import("@/lib/ad-visibility");
const cmp = await import("./useAdCmp");

let wide = true;
let ioCallbacks: Array<(e: { isIntersecting: boolean }[]) => void> = [];
const mqListeners: Array<() => void> = [];

beforeEach(() => {
  env.consented = true;
  contentHeight = 3000;
  wide = true;
  ioCallbacks = [];
  mqListeners.length = 0;
  ensure.mockClear();
  setAdsSuppressed(false);
  window.history.replaceState(null, "", "/umzug");
  window.matchMedia = vi.fn(() => ({
    get matches() { return wide; },
    addEventListener: (_: string, l: () => void) => mqListeners.push(l),
    removeEventListener() {},
  })) as never;
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    constructor(cb: (e: { isIntersecting: boolean }[]) => void) { ioCallbacks.push(cb); }
    observe() {}
    disconnect() {}
  };
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const w = wide ? 160 : 0;
    return { width: w, height: this.getAttribute("data-ad-content") !== null || this.className.includes("xl:flex-1") ? contentHeight : 0 } as DOMRect;
  });
  (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const tree = () => <AdRails><p>Inhalt</p></AdRails>;
const slots = (c: HTMLElement) => [...c.querySelectorAll("ins")].map((i) => i.getAttribute("data-ad-slot"));

describe("AdRails live (Mock-gated)", () => {
  it("lange Seite: 4 Rails mit 4 verschiedenen echten IDs", () => {
    const { container } = render(tree());
    expect(slots(container).sort()).toEqual(["4238348588", "6851085973", "6950298526", "7070577825"].sort());
  });

  it("kurzer Inhalt: keine unteren Rails, also keine zusätzliche Seitenhöhe", () => {
    contentHeight = 900;
    const { container } = render(tree());
    expect(slots(container).sort()).toEqual(["4238348588", "6950298526"]);
    expect(container.innerHTML).not.toContain("60vh");
  });

  it("ungefüllte untere Rail klappt komplett zusammen", async () => {
    const { container } = render(tree());
    await act(async () => { for (const cb of ioCallbacks) cb([{ isIntersecting: true }]); });
    const lower = container.querySelector('ins[data-ad-slot="6851085973"]')!;
    await act(async () => { lower.setAttribute("data-ad-status", "unfilled"); });
    expect((lower.parentElement as HTMLElement).style.display).toBe("none");
    expect(container.innerHTML).not.toContain("pt-[60vh]");
  });

  it("SPA-Wechsel auf geschützte/kurze Seite: Policy und CMP-Pfad folgen sofort", () => {
    const { container } = render(tree());
    expect(slots(container).length).toBe(4);
    act(() => navigateAdPath("/profil"));
    expect(slots(container).length).toBe(0);
    expect(vi.mocked(cmp.useAdCmpBootstrap)).toHaveBeenLastCalledWith(false, "/profil");
    act(() => navigateAdPath("/kontakt"));
    expect(slots(container).length).toBe(2);
    expect(container.textContent).toContain("Inhalt");
  });

  it("CSS-versteckte Rail (schmaler Viewport) fragt nie an; später sichtbar über matchMedia", async () => {
    wide = false;
    render(tree());
    await act(async () => { for (const cb of ioCallbacks) cb([{ isIntersecting: true }]); });
    expect(ensure).not.toHaveBeenCalled();
    wide = true;
    await act(async () => { for (const l of mqListeners) l(); });
    expect(ensure).toHaveBeenCalled();
  });

  it("Unterdrückung oder Routenwechsel während des Script-Awaits: kein push", async () => {
    let resolve!: (v: boolean) => void;
    ensure.mockImplementation(() => new Promise<boolean>((r) => (resolve = r)));
    render(tree());
    await act(async () => { ioCallbacks[0]!([{ isIntersecting: true }]); });
    window.history.replaceState(null, "", "/profil");
    await act(async () => resolve(true));
    expect((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle.length).toBe(0);
  });

  it("Widerruf zwischen Prüfung und push: kein push", async () => {
    permitted.mockReturnValueOnce(false).mockReturnValue(false);
    render(tree());
    await act(async () => { for (const cb of ioCallbacks) cb([{ isIntersecting: true }]); });
    expect((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle.length).toBe(0);
    permitted.mockReturnValue(true);
  });
});
