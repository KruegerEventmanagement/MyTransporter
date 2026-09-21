/**
 * Echter Browser-Adapter für die von Google zertifizierte Einwilligungsmeldung
 * (Funding Choices / Privacy & messaging) inklusive TCF v2.2-Auswertung und
 * Widerruf.
 *
 * Grundsätze (fail-closed):
 *  - Der CMP-Bootstrap (Laden des AdSense-Tags, damit die Meldung überhaupt
 *    erscheinen kann) ist strikt getrennt von der Erlaubnis, Anzeigen
 *    anzufragen. Dadurch entsteht kein Deadlock (Meldung wird über dasselbe
 *    Tag ausgeliefert), ohne dass je ungewollt eine Anzeige angefragt wird.
 *  - Vor dem Einfügen des Tags werden `googlefc.callbackQueue` und
 *    `adsbygoogle.pauseAdRequests = 1` gesetzt.
 *  - Anzeigenanfragen sind nur erlaubt, wenn die Gesamtkonfiguration
 *    einsatzbereit ist (Freigabe, enabled, bestätigte Live-QA) UND eine
 *    vollständige, geprüfte TCF-Einwilligung vorliegt.
 *  - Unbekannter/fehlerhafter/ladender Zustand, Ablehnung, erneut geöffnete
 *    Meldung oder Nicht-TCF-Regionen => keine Einwilligung.
 *  - Keine eigene localStorage-Einwilligung, keine Umdeutung des
 *    Cookie-Banners.
 */

import {
  ADSENSE_CONFIG,
  isAdSenseConfigured,
  isValidPublisherId,
  type AdSenseConfig,
} from "./adsense";
import { registerAdConsentAdapter } from "./adsense-consent";

/** Google Advertising Products (IAB TCF Global Vendor List). */
export const GOOGLE_VENDOR_ID = 755;
/** Zwecke, die Google für Anzeigenauslieferung/Messung benötigt. */
export const REQUIRED_PURPOSES = [2, 7, 9, 10] as const;
/** Zwecke, die für personalisierte Anzeigen zusätzlich nötig sind. */
export const PERSONALIZED_PURPOSES = [3, 4] as const;

/** Offizielle QA-Parameter der Google-Meldung. */
export const QA_PARAMS = { fc: "alwaysshow", fctype: "gdpr" } as const;

/** Öffentliche Seiten, auf denen die Meldung überhaupt starten darf. */
export const CMP_ALLOWED_PATHS = [
  "/",
  "/werbung",
  "/preise",
  "/langzeitmiete",
  "/faq",
  "/ueber-uns",
  "/kontakt",
] as const;

type Bool = boolean | undefined;

export interface TcfBooleanMap {
  consents?: Record<string, Bool>;
  legitimateInterests?: Record<string, Bool>;
}

export interface TcData {
  cmpStatus?: string;
  eventStatus?: string;
  gdprApplies?: unknown;
  tcString?: unknown;
  listenerId?: number;
  purpose?: TcfBooleanMap;
  vendor?: TcfBooleanMap;
  publisher?: {
    restrictions?: Record<string, Record<string, number>>;
  };
}

export interface TcfEvaluation {
  /** Nur true bei vollständiger, geprüfter Einwilligung für Google-Anzeigen. */
  consented: boolean;
  /** true = personalisiert erlaubt, false = nur nicht personalisiert (NPA). */
  personalized: boolean;
  reason: string;
}

const CLOSED = (reason: string): TcfEvaluation => ({
  consented: false,
  personalized: false,
  reason,
});

function flag(map: TcfBooleanMap | undefined, kind: "consents" | "legitimateInterests", id: number | string) {
  return map?.[kind]?.[String(id)] === true;
}

/** Publisher-Restriction: 0 = nicht erlaubt, 1 = nur Consent, 2 = nur LI. */
function restriction(tcData: TcData, purpose: number): number | undefined {
  return tcData.publisher?.restrictions?.[String(purpose)]?.[String(GOOGLE_VENDOR_ID)];
}

function purposeAllowed(tcData: TcData, purpose: number): boolean {
  const consent = flag(tcData.purpose, "consents", purpose);
  const li = flag(tcData.purpose, "legitimateInterests", purpose);
  const vendorConsent = flag(tcData.vendor, "consents", GOOGLE_VENDOR_ID);
  const vendorLi = flag(tcData.vendor, "legitimateInterests", GOOGLE_VENDOR_ID);
  const r = restriction(tcData, purpose);
  if (r === 0) return false;
  if (r === 1) return consent && vendorConsent;
  if (r === 2) return li && vendorLi;
  return (consent && vendorConsent) || (li && vendorLi);
}

/**
 * Reine, testbare Auswertung der TCF-Daten. Der Google-Tag konsumiert den
 * TC-String anschließend selbst autoritativ; diese Prüfung entscheidet nur,
 * ob überhaupt eine Anzeigenanfrage erlaubt ist.
 */
export function evaluateTcData(tcData: unknown, success = true): TcfEvaluation {
  if (success !== true) return CLOSED("TCF-Aufruf nicht erfolgreich");
  if (!tcData || typeof tcData !== "object") return CLOSED("Keine TCF-Daten");
  const data = tcData as TcData;
  if (data.cmpStatus !== "loaded") return CLOSED(`CMP-Status: ${String(data.cmpStatus)}`);
  if (data.eventStatus !== "tcloaded" && data.eventStatus !== "useractioncomplete") {
    return CLOSED(`Ereignisstatus: ${String(data.eventStatus)}`);
  }
  if (typeof data.gdprApplies !== "boolean") return CLOSED("GDPR-Geltung unbekannt");
  if (data.gdprApplies !== true) {
    // Außerhalb des bekannten TCF-Geltungsbereichs bleiben wir bewusst
    // geschlossen, bis dieser Fall gesondert geprüft und dokumentiert ist.
    return CLOSED("Außerhalb des bekannten TCF-Geltungsbereichs");
  }
  if (typeof data.tcString !== "string" || data.tcString.length === 0) {
    return CLOSED("Kein TC-String");
  }
  if (!flag(data.vendor, "consents", GOOGLE_VENDOR_ID)) {
    return CLOSED("Keine Einwilligung für Google (Vendor 755)");
  }
  if (!flag(data.purpose, "consents", 1)) return CLOSED("Zweck 1 ohne Einwilligung");
  for (const purpose of REQUIRED_PURPOSES) {
    if (!purposeAllowed(data, purpose)) return CLOSED(`Zweck ${purpose} nicht erlaubt`);
  }
  const personalized = PERSONALIZED_PURPOSES.every(
    (p) => restriction(data, p) !== 0 && flag(data.purpose, "consents", p),
  );
  return { consented: true, personalized, reason: personalized ? "Einwilligung (personalisiert)" : "Einwilligung (nicht personalisiert)" };
}

/* ------------------------------------------------------------------ */
/* Browser-Glue                                                        */
/* ------------------------------------------------------------------ */

type TcfApi = (
  command: string,
  version: number,
  callback: (tcData: unknown, success: boolean) => void,
  parameter?: unknown,
) => void;

export interface CmpWindow {
  googlefc?: {
    callbackQueue?: Array<unknown>;
    showRevocationMessage?: () => void;
  };
  adsbygoogle?: Array<unknown> & { pauseAdRequests?: number };
  __tcfapi?: TcfApi;
  location?: { pathname?: string; search?: string };
  document?: {
    createElement: (tag: string) => Record<string, unknown>;
    querySelector: (selector: string) => unknown;
    head: { appendChild: (node: unknown) => void };
  };
}

export interface CmpRuntime {
  win: CmpWindow;
  config: AdSenseConfig;
}

function defaultWin(): CmpWindow | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  return window as unknown as CmpWindow;
}

/** Ist der offizielle QA-Modus per URL-Parametern aktiv? */
export function isCmpQaMode(win: CmpWindow | null = defaultWin()): boolean {
  const search = win?.location?.search;
  if (!search) return false;
  const params = new URLSearchParams(search);
  return params.get("fc") === QA_PARAMS.fc && params.get("fctype") === QA_PARAMS.fctype;
}

/** Darf die Meldung auf diesem Pfad überhaupt starten? */
export function isCmpAllowedPath(pathname: string | undefined): boolean {
  if (!pathname) return false;
  const clean = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return (CMP_ALLOWED_PATHS as readonly string[]).includes(clean);
}

/**
 * Darf der CMP-Bootstrap laufen? Im Normalbetrieb nur bei vollständig
 * einsatzbereiter Konfiguration (also vor der Google-Freigabe nie), zusätzlich
 * im offiziellen QA-Modus auf erlaubten öffentlichen Pfaden.
 */
export function mayBootstrapCmp(
  options: { pathname?: string; suppressed?: boolean; win?: CmpWindow | null; config?: AdSenseConfig } = {},
): boolean {
  const win = options.win === undefined ? defaultWin() : options.win;
  const config = options.config ?? ADSENSE_CONFIG;
  if (!win) return false;
  if (options.suppressed) return false;
  if (!isValidPublisherId(config.publisherId)) return false;
  const pathname = options.pathname ?? win.location?.pathname;
  if (!isCmpAllowedPath(pathname)) return false;
  return isAdSenseConfigured(config) || isCmpQaMode(win);
}

/**
 * Sind Anzeigenanfragen erlaubt? Im QA-Modus NIE – dort wird ausschließlich
 * die Einwilligungsmeldung geprüft.
 */
export function areAdRequestsAllowed(
  options: { win?: CmpWindow | null; config?: AdSenseConfig } = {},
): boolean {
  const win = options.win === undefined ? defaultWin() : options.win;
  const config = options.config ?? ADSENSE_CONFIG;
  if (!isAdSenseConfigured(config)) return false;
  if (win && isCmpQaMode(win)) return false;
  return true;
}

export function scriptSrc(config: AdSenseConfig = ADSENSE_CONFIG): string {
  return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(config.publisherId)}`;
}

let bootstrapped: CmpWindow | null = null;
let apiReady = false;
let lastEvaluation: TcfEvaluation = CLOSED("Noch nicht geprüft");
const apiReadyWaiters = new Set<(ready: boolean) => void>();
const changeListeners = new Set<(consented: boolean) => void>();
let tcfListenerId: number | null = null;

/** Nur für Tests: internen Zustand zurücksetzen. */
export function resetCmpStateForTests(): void {
  bootstrapped = null;
  apiReady = false;
  lastEvaluation = CLOSED("Noch nicht geprüft");
  apiReadyWaiters.clear();
  changeListeners.clear();
  tcfListenerId = null;
}

export function isCmpApiReady(): boolean {
  return apiReady;
}

export function lastAdConsentEvaluation(): TcfEvaluation {
  return lastEvaluation;
}

/** Anzeigenanfragen sofort anhalten (Widerruf, Route-/Suppression-Ende). */
export function pauseAdRequests(win: CmpWindow | null = defaultWin()): void {
  if (!win) return;
  const queue = (win.adsbygoogle = win.adsbygoogle || ([] as Array<unknown> & { pauseAdRequests?: number }));
  queue.pauseAdRequests = 1;
}

function setApiReady(value: boolean) {
  apiReady = value;
  for (const waiter of apiReadyWaiters) waiter(value);
  apiReadyWaiters.clear();
}

function attachTcfListener(win: CmpWindow) {
  const api = win.__tcfapi;
  if (!api || tcfListenerId !== null) return;
  try {
    api("addEventListener", 2, (tcData, success) => {
      const data = tcData as TcData | undefined;
      if (typeof data?.listenerId === "number") tcfListenerId = data.listenerId;
      const previous = lastEvaluation.consented;
      lastEvaluation = evaluateTcData(tcData, success);
      if (!lastEvaluation.consented) pauseAdRequests(win);
      if (lastEvaluation.consented !== previous) {
        for (const listener of changeListeners) listener(lastEvaluation.consented);
      }
    });
  } catch {
    lastEvaluation = CLOSED("TCF-API-Fehler");
  }
}

/**
 * Startet die Einwilligungsmeldung einmalig: Queue und Pause VOR dem Tag,
 * dann das offizielle Script. Anzeigen werden dabei niemals angefragt.
 */
export function bootstrapAdConsentCmp(
  options: { pathname?: string; suppressed?: boolean; win?: CmpWindow | null; config?: AdSenseConfig } = {},
): boolean {
  const win = options.win === undefined ? defaultWin() : options.win;
  const config = options.config ?? ADSENSE_CONFIG;
  if (!win) return false;
  if (!mayBootstrapCmp({ ...options, win, config })) return false;
  if (bootstrapped === win) return true;

  // 1) Queue und Pause VOR dem Tag setzen.
  const fc = (win.googlefc = win.googlefc || {});
  fc.callbackQueue = fc.callbackQueue || [];
  pauseAdRequests(win);

  // 2) CONSENT_API_READY abwarten und dann dauerhaft auf Änderungen hören.
  fc.callbackQueue.push({
    CONSENT_API_READY: () => {
      setApiReady(true);
      attachTcfListener(win);
    },
  });

  // 3) Offizielles Script genau einmal einfügen.
  const doc = win.document;
  if (doc) {
    const src = scriptSrc(config);
    if (!doc.querySelector(`script[src="${src}"]`)) {
      const script = doc.createElement("script");
      script.src = src;
      script.async = true;
      script.crossOrigin = "anonymous";
      doc.head.appendChild(script);
    }
  }

  bootstrapped = win;
  registerRealAdConsentAdapter(win);
  return true;
}

/** Wartet auf CONSENT_API_READY (fail-closed bei Timeout). */
function waitForApiReady(timeoutMs: number): Promise<boolean> {
  if (apiReady) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      apiReadyWaiters.delete(finish);
      resolve(value);
    };
    apiReadyWaiters.add(finish);
    setTimeout(() => finish(false), timeoutMs);
  });
}

/** Einwilligungsabfrage über die echte CMP; jeder Unsicherheitsfall = false. */
export async function requestTcfAdConsent(
  timeoutMs = 3000,
  win: CmpWindow | null = defaultWin(),
): Promise<boolean> {
  if (!win) return false;
  const ready = await waitForApiReady(timeoutMs);
  if (!ready) {
    pauseAdRequests(win);
    lastEvaluation = CLOSED("CMP nicht bereit (Timeout)");
    return false;
  }
  attachTcfListener(win);
  if (lastEvaluation.consented) return true;
  const api = win.__tcfapi;
  if (!api) return false;
  const result = await new Promise<TcfEvaluation>((resolve) => {
    let done = false;
    const finish = (value: TcfEvaluation) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    setTimeout(() => finish(CLOSED("TCF-Abfrage Timeout")), timeoutMs);
    try {
      api("getTCData", 2, (tcData, success) => finish(evaluateTcData(tcData, success)));
    } catch {
      finish(CLOSED("TCF-Abfrage fehlgeschlagen"));
    }
  });
  lastEvaluation = result;
  if (!result.consented) pauseAdRequests(win);
  return result.consented;
}

/** Registriert den echten Adapter an der bestehenden Einwilligungs-Grenze. */
export function registerRealAdConsentAdapter(win: CmpWindow | null = defaultWin()): void {
  registerAdConsentAdapter({
    provider: "google-funding-choices-tcf-v2.2",
    hasAdConsent: (timeoutMs) => requestTcfAdConsent(timeoutMs, win),
    subscribe: (onChange) => {
      changeListeners.add(onChange);
      return () => changeListeners.delete(onChange);
    },
  });
}

/**
 * Widerruf: erst Anfragen anhalten und vorhandene Anzeigen entfernen,
 * danach die offizielle Widerrufs-Meldung öffnen.
 */
export function showAdConsentRevocationMessage(
  win: CmpWindow | null = defaultWin(),
  removeAds: () => void = () => removeRenderedAds(win),
): boolean {
  if (!win || !apiReady) return false;
  pauseAdRequests(win);
  lastEvaluation = CLOSED("Widerruf geöffnet");
  for (const listener of changeListeners) listener(false);
  try {
    removeAds();
  } catch {
    /* Aufräumen darf den Widerruf nicht blockieren */
  }
  const fc = (win.googlefc = win.googlefc || {});
  fc.callbackQueue = fc.callbackQueue || [];
  fc.callbackQueue.push({
    REVOCATION_MESSAGE_READY: () => {
      try {
        win.googlefc?.showRevocationMessage?.();
      } catch {
        /* ignorieren */
      }
    },
  });
  try {
    win.googlefc?.showRevocationMessage?.();
  } catch {
    /* ignorieren */
  }
  return true;
}

/** Entfernt gerenderte Anzeigenflächen aus dem DOM (nur Aufräumen). */
export function removeRenderedAds(win: CmpWindow | null = defaultWin()): void {
  if (!win) return;
  if (typeof document === "undefined") return;
  for (const ins of Array.from(document.querySelectorAll("ins.adsbygoogle"))) {
    ins.parentElement?.removeChild(ins);
  }
}
