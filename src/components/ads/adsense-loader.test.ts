import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADSENSE_CONFIG, type AdSenseConfig } from "@/lib/adsense";

/* Steuerbarer CMP-Zustand (Generation, Bootstrap, Consent). */
const state = {
  generation: 1,
  bootstrapped: true,
  allowed: true,
  consented: true,
  personalized: true,
};

vi.mock("@/lib/adsense-cmp", () => ({
  cmpGeneration: () => state.generation,
  isCmpBootstrapped: () => state.bootstrapped,
  areAdRequestsAllowed: () => state.allowed,
  lastAdConsentEvaluation: () => ({
    consented: state.consented,
    personalized: state.personalized,
    reason: "test",
  }),
  pauseAdRequests: () => {
    const q = queue();
    q.pauseAdRequests = 1;
    q.requestNonPersonalizedAds = 1;
  },
  allowAdRequests: () => {
    const q = queue();
    q.requestNonPersonalizedAds = state.personalized ? 0 : 1;
    q.pauseAdRequests = 0;
  },
}));

let consentResolver: (value: boolean) => void = () => {};
let consentSubscribers: Array<(consented: boolean) => void> = [];

vi.mock("@/lib/adsense-consent", () => ({
  requestAdConsent: () =>
    new Promise<boolean>((resolve) => {
      consentResolver = resolve;
    }),
  subscribeAdConsent: (cb: (consented: boolean) => void) => {
    consentSubscribers.push(cb);
    return () => {
      consentSubscribers = consentSubscribers.filter((c) => c !== cb);
    };
  },
}));

import {
  adRequestsCurrentlyPermitted,
  ensureAdSenseScript,
  resetAdSenseScriptLoad,
} from "./adsense-loader";

type Queue = Array<unknown> & { pauseAdRequests?: number; requestNonPersonalizedAds?: number };

function queue(): Queue {
  const w = window as unknown as { adsbygoogle?: Queue };
  w.adsbygoogle = w.adsbygoogle || ([] as unknown as Queue);
  return w.adsbygoogle;
}

const readyConfig: AdSenseConfig = {
  ...ADSENSE_CONFIG,
  enabled: true,
  siteApproved: true,
  certifiedCmpConfigured: true,
  liveCmpVerified: true,
};

beforeEach(() => {
  state.generation = 1;
  state.bootstrapped = true;
  state.allowed = true;
  state.consented = true;
  state.personalized = true;
  consentSubscribers = [];
  (window as unknown as { adsbygoogle?: Queue }).adsbygoogle = undefined;
  resetAdSenseScriptLoad();
});

describe("adsense-loader Lebenszyklus", () => {
  it("gibt nach Einwilligung frei und setzt NPA explizit auf 0", async () => {
    const p = ensureAdSenseScript(readyConfig);
    consentResolver(true);
    await expect(p).resolves.toBe(true);
    expect(queue().pauseAdRequests).toBe(0);
    expect(queue().requestNonPersonalizedAds).toBe(0);
  });

  it("setzt NPA auf 1, wenn Personalisierung nicht erlaubt ist", async () => {
    state.personalized = false;
    const p = ensureAdSenseScript(readyConfig);
    consentResolver(true);
    await expect(p).resolves.toBe(true);
    expect(queue().requestNonPersonalizedAds).toBe(1);
    expect(queue().pauseAdRequests).toBe(0);
  });

  it("gibt nach dem await nicht frei, wenn die Generation gewechselt hat", async () => {
    const p = ensureAdSenseScript(readyConfig);
    state.generation = 2; // Teardown/Routenwechsel während der Abfrage
    consentResolver(true);
    await expect(p).resolves.toBe(false);
    expect(queue().pauseAdRequests).toBe(1);
  });

  it("gibt nach dem await nicht frei, wenn der Consent widerrufen wurde", async () => {
    const p = ensureAdSenseScript(readyConfig);
    state.consented = false;
    consentResolver(true);
    await expect(p).resolves.toBe(false);
    expect(queue().pauseAdRequests).toBe(1);
  });

  it("gibt nach dem await nicht frei, wenn der Bootstrap abgebaut wurde", async () => {
    const p = ensureAdSenseScript(readyConfig);
    state.bootstrapped = false;
    consentResolver(true);
    await expect(p).resolves.toBe(false);
    expect(queue().pauseAdRequests).toBe(1);
  });

  it("pausiert sofort und liefert false bei Unterdrückung", async () => {
    await expect(ensureAdSenseScript(readyConfig, { suppressed: true })).resolves.toBe(false);
    expect(queue().pauseAdRequests).toBe(1);
  });

  it("nutzt keinen alten Cache nach Generationswechsel und fragt erneut", async () => {
    const first = ensureAdSenseScript(readyConfig);
    consentResolver(true);
    await first;
    state.generation = 5;
    const second = ensureAdSenseScript(readyConfig);
    expect(second).not.toBe(first);
    consentResolver(true);
    await expect(second).resolves.toBe(true);
  });

  it("verwirft den Cache nach Widerruf über den Consent-Watcher", async () => {
    const first = ensureAdSenseScript(readyConfig);
    consentResolver(true);
    await first;
    expect(consentSubscribers.length).toBe(1);
    state.consented = false;
    consentSubscribers[0](false);
    expect(queue().pauseAdRequests).toBe(1);
    expect(adRequestsCurrentlyPermitted(readyConfig)).toBe(false);
    // Erneuter Aufruf ist ein frischer Ablauf (kein gecachtes true).
    const second = ensureAdSenseScript(readyConfig);
    await expect(second).resolves.toBe(false);
  });

  it("aktualisiert NPA bei Consent-Änderung ohne neuen Ladevorgang", async () => {
    const p = ensureAdSenseScript(readyConfig);
    consentResolver(true);
    await p;
    state.personalized = false;
    consentSubscribers[0](true);
    expect(queue().requestNonPersonalizedAds).toBe(1);
    expect(queue().pauseAdRequests).toBe(0);
  });

  it("adRequestsCurrentlyPermitted ist fail-closed", () => {
    expect(adRequestsCurrentlyPermitted(readyConfig)).toBe(true);
    expect(adRequestsCurrentlyPermitted(readyConfig, true)).toBe(false);
    state.allowed = false;
    expect(adRequestsCurrentlyPermitted(readyConfig)).toBe(false);
    state.allowed = true;
    state.bootstrapped = false;
    expect(adRequestsCurrentlyPermitted(readyConfig)).toBe(false);
  });

  it("fragt in Produktionskonfiguration (nicht freigegeben) niemals an", async () => {
    state.allowed = false;
    await expect(ensureAdSenseScript(ADSENSE_CONFIG)).resolves.toBe(false);
    expect(queue().pauseAdRequests).toBeUndefined();
  });
});
