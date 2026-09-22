import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_VENDOR_ID,
  areAdRequestsAllowed,
  bootstrapAdConsentCmp,
  evaluateTcData,
  isCmpAllowedPath,
  isCmpApiReady,
  isCmpQaMode,
  lastAdConsentEvaluation,
  mayBootstrapCmp,
  requestTcfAdConsent,
  resetCmpStateForTests,
  showAdConsentRevocationMessage,
  teardownAdConsentCmp,
  type CmpWindow,
  type TcData,
} from "./adsense-cmp";
import { subscribeAdConsent } from "./adsense-consent";
import { ADSENSE_CONFIG, type AdSenseConfig } from "./adsense";

const readyConfig: AdSenseConfig = {
  ...ADSENSE_CONFIG,
  enabled: true,
  siteApproved: true,
  certifiedCmpConfigured: true,
  liveCmpVerified: true,
};

function granted(overrides: Partial<TcData> = {}): TcData {
  return {
    cmpStatus: "loaded",
    eventStatus: "tcloaded",
    gdprApplies: true,
    tcString: "CO-real-tc-string",
    listenerId: 1,
    vendor: { consents: { [GOOGLE_VENDOR_ID]: true }, legitimateInterests: { [GOOGLE_VENDOR_ID]: true } },
    purpose: {
      consents: { 1: true, 2: true, 3: true, 4: true, 7: true, 9: true, 10: true },
      legitimateInterests: { 2: true, 7: true, 9: true, 10: true },
    },
    ...overrides,
  };
}

interface ScriptNode extends Record<string, unknown> {
  onerror?: () => void;
  onload?: () => void;
}

interface FakeWin extends CmpWindow {
  scripts: string[];
  scriptNodes: ScriptNode[];
  listeners: Array<(data: unknown, success: boolean) => void>;
  removedListenerIds: unknown[];
}

function makeWin(search = ""): FakeWin {
  const scripts: string[] = [];
  const scriptNodes: ScriptNode[] = [];
  const win: FakeWin = {
    scripts,
    scriptNodes,
    listeners: [],
    removedListenerIds: [],
    location: { pathname: "/", search },
    document: {
      createElement: () => ({}) as ScriptNode,
      querySelector: (selector: string) => (scripts.some((s) => selector.includes(s)) ? {} : null),
      head: {
        appendChild: (node: unknown) => {
          const script = node as ScriptNode;
          scriptNodes.push(script);
          scripts.push(String(script.src));
        },
      },
    },
  };
  return win;
}

/**
 * Simuliert das geladene offizielle Script: echte `__tcfapi`-Funktion UND
 * `googlefc.showRevocationMessage`. Optional wird sofort ein TCF-Ereignis
 * geliefert (wie die echte Subscription).
 */
function installFundingChoices(win: FakeWin, data?: unknown, success = true) {
  win.googlefc = { ...(win.googlefc ?? {}), showRevocationMessage: vi.fn() };
  win.__tcfapi = (command, _version, callback, parameter) => {
    if (command === "addEventListener") {
      win.listeners.push(callback);
      if (data !== undefined) callback(data, success);
      return;
    }
    if (command === "removeEventListener") {
      win.removedListenerIds.push(parameter);
      win.listeners = [];
      callback(undefined, true);
    }
  };
}

function emit(win: FakeWin, data: unknown, success = true) {
  for (const listener of [...win.listeners]) listener(data, success);
}

/** CONSENT_API_READY der gefälschten Meldung auslösen. */
function fireApiReady(win: CmpWindow) {
  for (const entry of win.googlefc?.callbackQueue ?? []) {
    (entry as { CONSENT_API_READY?: () => void }).CONSENT_API_READY?.();
  }
}

beforeEach(() => {
  resetCmpStateForTests();
});

describe("TCF-Auswertung", () => {
  it("erlaubt personalisierte Anzeigen bei vollständiger Einwilligung", () => {
    const result = evaluateTcData(granted());
    expect(result.consented).toBe(true);
    expect(result.personalized).toBe(true);
  });

  it("erlaubt nur NPA ohne Zwecke 3/4", () => {
    const data = granted();
    data.purpose!.consents = { 1: true, 2: true, 7: true, 9: true, 10: true };
    const result = evaluateTcData(data);
    expect(result.consented).toBe(true);
    expect(result.personalized).toBe(false);
  });

  it("akzeptiert berechtigtes Interesse für Zwecke 2/7/9/10", () => {
    const data = granted();
    data.purpose!.consents = { 1: true };
    const result = evaluateTcData(data);
    expect(result.consented).toBe(true);
  });

  it("bleibt geschlossen bei Ablehnung, Unbekanntem, Laden und Fehlern", () => {
    expect(evaluateTcData(granted({ vendor: { consents: { [GOOGLE_VENDOR_ID]: false } } })).consented).toBe(false);
    expect(evaluateTcData(granted({ cmpStatus: "loading" })).consented).toBe(false);
    expect(evaluateTcData(granted({ eventStatus: "cmpuishown" })).consented).toBe(false);
    expect(evaluateTcData(granted({ gdprApplies: undefined })).consented).toBe(false);
    expect(evaluateTcData(granted({ gdprApplies: false })).consented).toBe(false);
    expect(evaluateTcData(granted({ tcString: "" })).consented).toBe(false);
    expect(evaluateTcData(granted(), false).consented).toBe(false);
    expect(evaluateTcData(undefined).consented).toBe(false);
    const noPurpose1 = granted();
    noPurpose1.purpose!.consents = { 2: true, 7: true, 9: true, 10: true };
    expect(evaluateTcData(noPurpose1).consented).toBe(false);
  });

  it("respektiert Publisher-Restrictions", () => {
    const blocked = granted({ publisher: { restrictions: { 7: { [String(GOOGLE_VENDOR_ID)]: 0 } } } });
    expect(evaluateTcData(blocked).consented).toBe(false);
    const noPersonalization = granted({
      publisher: { restrictions: { 3: { [String(GOOGLE_VENDOR_ID)]: 0 } } },
    });
    const result = evaluateTcData(noPersonalization);
    expect(result.consented).toBe(true);
    expect(result.personalized).toBe(false);
  });

  it("Restriction 'nur berechtigtes Interesse' kann Consent-Zwecke 1/3/4 nicht erlauben", () => {
    const purpose1LiOnly = granted({ publisher: { restrictions: { 1: { [String(GOOGLE_VENDOR_ID)]: 2 } } } });
    expect(evaluateTcData(purpose1LiOnly).consented).toBe(false);
    const personalizationLiOnly = granted({
      publisher: { restrictions: { 4: { [String(GOOGLE_VENDOR_ID)]: 2 } } },
    });
    const result = evaluateTcData(personalizationLiOnly);
    expect(result.consented).toBe(true);
    expect(result.personalized).toBe(false);
  });
});

describe("Bootstrap und Gating", () => {
  it("startet im Normalbetrieb ohne Freigabe NICHT (keine Google-Anfrage)", () => {
    const win = makeWin();
    expect(mayBootstrapCmp({ win, pathname: "/" })).toBe(false);
    expect(bootstrapAdConsentCmp({ win, pathname: "/" })).toBe(false);
    expect(win.scripts).toEqual([]);
    expect(win.adsbygoogle).toBeUndefined();
  });

  it("startet im offiziellen QA-Modus, pausiert Anfragen und lädt das Tag genau einmal", () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    expect(isCmpQaMode(win)).toBe(true);
    expect(bootstrapAdConsentCmp({ win, pathname: "/" })).toBe(true);
    expect(bootstrapAdConsentCmp({ win, pathname: "/" })).toBe(true);
    expect(win.scripts).toHaveLength(1);
    expect(win.scripts[0]).toContain("client=ca-pub-6974851907377988");
    expect(win.adsbygoogle?.pauseAdRequests).toBe(1);
    // Im QA-Modus sind Anzeigenanfragen NIE erlaubt, auch mit Einwilligung.
    expect(areAdRequestsAllowed({ win, config: readyConfig })).toBe(false);
  });

  it("startet nie bei Unterdrückung oder auf ausgeschlossenen Seiten", () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    expect(mayBootstrapCmp({ win, pathname: "/", suppressed: true })).toBe(false);
    expect(mayBootstrapCmp({ win, pathname: "/profil" })).toBe(false);
    expect(mayBootstrapCmp({ win, pathname: "/admin" })).toBe(false);
    expect(mayBootstrapCmp({ win, pathname: "/impressum" })).toBe(false);
    expect(mayBootstrapCmp({ win, pathname: "/api/public/health/automations" })).toBe(false);
    expect(isCmpAllowedPath("/preise")).toBe(true);
    expect(isCmpAllowedPath("/buchung/123")).toBe(false);
  });

  it("gibt Anfragen nur bei vollständig geprüfter Konfiguration frei", () => {
    const win = makeWin();
    expect(areAdRequestsAllowed({ win, config: ADSENSE_CONFIG })).toBe(false);
    expect(areAdRequestsAllowed({ win, config: { ...readyConfig, liveCmpVerified: false } })).toBe(false);
    expect(areAdRequestsAllowed({ win, config: readyConfig })).toBe(true);
  });

  it("bleibt bei Script-Fehler fail-closed", async () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    win.scriptNodes[0]!.onerror?.();
    expect(isCmpApiReady()).toBe(false);
    expect(lastAdConsentEvaluation().consented).toBe(false);
    expect(win.adsbygoogle?.pauseAdRequests).toBe(1);
    await expect(requestTcfAdConsent(20, win)).resolves.toBe(false);
  });

  it("ist nur bereit, wenn die echten API-Funktionen existieren", () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    // Nur der Callback allein macht die API NICHT bereit.
    fireApiReady(win);
    expect(isCmpApiReady()).toBe(false);
    // Auch __tcfapi allein genügt nicht (kein showRevocationMessage).
    win.__tcfapi = () => {};
    fireApiReady(win);
    expect(isCmpApiReady()).toBe(false);
    installFundingChoices(win, granted());
    fireApiReady(win);
    expect(isCmpApiReady()).toBe(true);
  });
});

describe("Einwilligungsabfrage über die echte Meldung", () => {
  it("liefert true nach Zustimmung (nur über addEventListener)", async () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    installFundingChoices(win, granted());
    fireApiReady(win);
    expect(isCmpApiReady()).toBe(true);
    await expect(requestTcfAdConsent(50, win)).resolves.toBe(true);
  });

  it("wartet auf das erste Ereignis der Subscription", async () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    installFundingChoices(win); // noch kein Ereignis
    fireApiReady(win);
    const pending = requestTcfAdConsent(500, win);
    emit(win, granted());
    await expect(pending).resolves.toBe(true);
  });

  it("registriert den Listener genau einmal (kein Doppel-Listener)", () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    installFundingChoices(win, granted());
    fireApiReady(win);
    fireApiReady(win);
    bootstrapAdConsentCmp({ win, pathname: "/" });
    expect(win.listeners).toHaveLength(1);
    expect(win.scripts).toHaveLength(1);
  });

  it("liefert false nach Ablehnung und pausiert Anfragen", async () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    installFundingChoices(win, granted({ vendor: { consents: { [GOOGLE_VENDOR_ID]: false } } }));
    fireApiReady(win);
    await expect(requestTcfAdConsent(50, win)).resolves.toBe(false);
    expect(win.adsbygoogle?.pauseAdRequests).toBe(1);
  });

  it("liefert false bei Timeout ohne bereite Meldung", async () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    await expect(requestTcfAdConsent(20, win)).resolves.toBe(false);
    expect(win.adsbygoogle?.pauseAdRequests).toBe(1);
  });

  it("liefert false bei Fehler der TCF-API", async () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    win.googlefc = { ...(win.googlefc ?? {}), showRevocationMessage: () => {} };
    win.__tcfapi = () => {
      throw new Error("boom");
    };
    fireApiReady(win);
    await expect(requestTcfAdConsent(30, win)).resolves.toBe(false);
    expect(win.adsbygoogle?.pauseAdRequests).toBe(1);
  });

  it("meldet Personalisierungswechsel auch bei unverändertem consented", async () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    installFundingChoices(win);
    fireApiReady(win);
    const onChange = vi.fn();
    subscribeAdConsent(onChange);
    emit(win, granted());
    const npa = granted();
    npa.purpose!.consents = { 1: true, 2: true, 7: true, 9: true, 10: true };
    emit(win, npa);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([true, true]);
    expect(lastAdConsentEvaluation().personalized).toBe(false);
  });
});

describe("Abbau und Widerruf", () => {
  it("entfernt Listener und ignoriert veraltete Callbacks nach dem Abbau", async () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    installFundingChoices(win);
    fireApiReady(win);
    const staleListener = win.listeners[0]!;
    teardownAdConsentCmp(win);
    expect(win.removedListenerIds).toEqual([]);
    expect(isCmpApiReady()).toBe(false);
    // Veralteter Callback nach dem Abbau darf nichts freigeben.
    staleListener(granted(), true);
    expect(lastAdConsentEvaluation().consented).toBe(false);
    expect(win.adsbygoogle?.pauseAdRequests).toBe(1);
    await expect(requestTcfAdConsent(20, win)).resolves.toBe(false);
  });

  it("entfernt einen registrierten Listener über removeEventListener", () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    installFundingChoices(win, granted());
    fireApiReady(win);
    teardownAdConsentCmp(win);
    expect(win.removedListenerIds).toEqual([1]);
    expect(win.listeners).toHaveLength(0);
  });

  it("widerruft: pausiert, schließt den Zustand und öffnet die Meldung genau einmal", async () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    installFundingChoices(win, granted());
    fireApiReady(win);
    await requestTcfAdConsent(50, win);
    const onChange = vi.fn();
    subscribeAdConsent(onChange);
    expect(showAdConsentRevocationMessage(win)).toBe(true);
    expect(onChange).toHaveBeenCalledWith(false);
    expect(win.adsbygoogle?.pauseAdRequests).toBe(1);
    expect(lastAdConsentEvaluation().consented).toBe(false);
    // Dokumentierter Queue-Eintrag: öffnet die Meldung genau einmal.
    fireApiReady(win);
    fireApiReady(win);
    expect(win.googlefc!.showRevocationMessage).toHaveBeenCalledTimes(1);
  });

  it("zeigt keinen Widerruf, solange die Meldung nicht bereit ist", () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    expect(showAdConsentRevocationMessage(win)).toBe(false);
  });
});
