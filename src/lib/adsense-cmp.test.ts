import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_VENDOR_ID,
  areAdRequestsAllowed,
  bootstrapAdConsentCmp,
  evaluateTcData,
  isCmpAllowedPath,
  isCmpApiReady,
  isCmpQaMode,
  mayBootstrapCmp,
  requestTcfAdConsent,
  resetCmpStateForTests,
  showAdConsentRevocationMessage,
  type CmpWindow,
  type TcData,
} from "./adsense-cmp";
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
    vendor: { consents: { [GOOGLE_VENDOR_ID]: true }, legitimateInterests: { [GOOGLE_VENDOR_ID]: true } },
    purpose: {
      consents: { 1: true, 2: true, 3: true, 4: true, 7: true, 9: true, 10: true },
      legitimateInterests: { 2: true, 7: true, 9: true, 10: true },
    },
    ...overrides,
  };
}

interface FakeWin extends CmpWindow {
  scripts: string[];
}

function makeWin(search = ""): FakeWin {
  const scripts: string[] = [];
  const win: FakeWin = {
    scripts,
    location: { pathname: "/", search },
    document: {
      createElement: () => ({}) as Record<string, unknown>,
      querySelector: (selector: string) =>
        scripts.some((s) => selector.includes(s)) ? {} : null,
      head: {
        appendChild: (node: unknown) => {
          scripts.push(String((node as { src?: string }).src));
        },
      },
    },
  };
  return win;
}

/** CONSENT_API_READY der gefälschten Meldung auslösen. */
function fireApiReady(win: CmpWindow) {
  for (const entry of win.googlefc?.callbackQueue ?? []) {
    (entry as { CONSENT_API_READY?: () => void }).CONSENT_API_READY?.();
  }
}

function installTcfApi(win: CmpWindow, data: unknown, success = true) {
  win.__tcfapi = (command, _version, callback) => {
    if (command === "addEventListener" || command === "getTCData") {
      callback(data, success);
    }
  };
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
});

describe("Einwilligungsabfrage über die echte Meldung", () => {
  it("liefert true nach Zustimmung", async () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    installTcfApi(win, granted());
    fireApiReady(win);
    expect(isCmpApiReady()).toBe(true);
    await expect(requestTcfAdConsent(50, win)).resolves.toBe(true);
  });

  it("liefert false nach Ablehnung und pausiert Anfragen", async () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    installTcfApi(win, granted({ vendor: { consents: { [GOOGLE_VENDOR_ID]: false } } }));
    fireApiReady(win);
    await expect(requestTcfAdConsent(50, win)).resolves.toBe(false);
    expect(win.adsbygoogle?.pauseAdRequests).toBe(1);
  });

  it("liefert false bei Timeout ohne bereite Meldung", async () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    await expect(requestTcfAdConsent(20, win)).resolves.toBe(false);
  });

  it("liefert false bei Fehler der TCF-API", async () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    win.__tcfapi = () => {
      throw new Error("boom");
    };
    fireApiReady(win);
    await expect(requestTcfAdConsent(30, win)).resolves.toBe(false);
  });

  it("widerruft: pausiert, räumt auf und öffnet die offizielle Meldung", async () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    bootstrapAdConsentCmp({ win, pathname: "/" });
    installTcfApi(win, granted());
    fireApiReady(win);
    await requestTcfAdConsent(50, win);
    const show = vi.fn();
    win.googlefc!.showRevocationMessage = show;
    const cleanup = vi.fn();
    expect(showAdConsentRevocationMessage(win, cleanup)).toBe(true);
    expect(cleanup).toHaveBeenCalled();
    expect(win.adsbygoogle?.pauseAdRequests).toBe(1);
    expect(show).toHaveBeenCalled();
  });

  it("zeigt keinen Widerruf, solange die Meldung nicht bereit ist", () => {
    const win = makeWin("?fc=alwaysshow&fctype=gdpr");
    expect(showAdConsentRevocationMessage(win, () => {})).toBe(false);
  });
});
