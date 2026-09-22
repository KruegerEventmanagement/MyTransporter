/**
 * Freigabe für echte Anzeigenanfragen.
 *
 * Das Google-Script wird ausschließlich vom CMP-Bootstrap geladen (damit die
 * Einwilligungsmeldung überhaupt erscheinen kann, siehe adsense-cmp.ts) und
 * startet immer mit `pauseAdRequests = 1`. Diese Funktion gibt Anfragen nur
 * frei, wenn die Konfiguration vollständig einsatzbereit ist, der QA-Modus
 * NICHT aktiv ist und die echte CMP eine vollständige Einwilligung bestätigt.
 *
 * Wichtig: Eine einmal erfolgreiche Freigabe wird NICHT dauerhaft gecacht.
 * Jeder Aufruf prüft Konfiguration, Route/Unterdrückung, CMP-Generation und
 * den aktuellen Einwilligungszustand erneut; nach Widerruf, Teardown oder
 * Routenwechsel wird der Cache ungültig.
 */

import { ADSENSE_CONFIG, isAdSenseConfigured, type AdSenseConfig } from "@/lib/adsense";
import { requestAdConsent, subscribeAdConsent } from "@/lib/adsense-consent";
import {
  allowAdRequests,
  areAdRequestsAllowed,
  cmpGeneration,
  isCmpBootstrapped,
  lastAdConsentEvaluation,
  pauseAdRequests,
} from "@/lib/adsense-cmp";

let loadPromise: Promise<boolean> | null = null;
let consentWatcher: (() => void) | null = null;
let currentToken: object | null = null;
let cachedGeneration = -1;

/** Setzt den Freigabezustand zurück (z. B. nach Widerruf oder Teardown). */
export function resetAdSenseScriptLoad(): void {
  loadPromise = null;
  currentToken = null; // laufende Abläufe werden dadurch ungültig
  cachedGeneration = -1;
  if (consentWatcher) {
    try {
      consentWatcher();
    } catch {
      /* ignorieren */
    }
    consentWatcher = null;
  }
}

function watchConsentRevocation() {
  if (consentWatcher) return;
  consentWatcher = subscribeAdConsent((consented) => {
    if (!consented) {
      pauseAdRequests();
      resetAdSenseScriptLoad();
    } else {
      // Personalisierung kann sich geändert haben: NPA neu setzen.
      if (areAdRequestsAllowed()) allowAdRequests();
    }
  });
}

/** Sind Anfragen aktuell – unabhängig vom Cache – erlaubt? */
export function adRequestsCurrentlyPermitted(
  config: AdSenseConfig = ADSENSE_CONFIG,
  suppressed = false,
): boolean {
  if (typeof window === "undefined") return false;
  if (suppressed) return false;
  if (!isAdSenseConfigured(config)) return false;
  if (!areAdRequestsAllowed({ config })) return false;
  if (!isCmpBootstrapped()) return false;
  return lastAdConsentEvaluation().consented;
}

export function ensureAdSenseScript(
  config: AdSenseConfig = ADSENSE_CONFIG,
  options: { suppressed?: boolean } = {},
): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(false);
  const suppressed = options.suppressed === true;
  if (suppressed) {
    pauseAdRequests();
    resetAdSenseScriptLoad();
    return Promise.resolve(false);
  }
  if (!isAdSenseConfigured(config)) return Promise.resolve(false);
  if (!areAdRequestsAllowed({ config })) return Promise.resolve(false);
  if (!isCmpBootstrapped()) return Promise.resolve(false);

  const generation = cmpGeneration();
  if (loadPromise && cachedGeneration !== generation) {
    // Teardown/Routenwechsel zwischenzeitlich: Cache verwerfen.
    resetAdSenseScriptLoad();
  }
  if (loadPromise) return loadPromise;

  const token = {};
  currentToken = token;
  cachedGeneration = generation;

  const stillValid = () =>
    currentToken === token &&
    cmpGeneration() === generation &&
    isCmpBootstrapped() &&
    isAdSenseConfigured(config) &&
    areAdRequestsAllowed({ config }) &&
    lastAdConsentEvaluation().consented;

  const pending = (async () => {
    const consented = await requestAdConsent();
    // Nach dem await ALLES erneut prüfen: Generation, Route/Unterdrückung,
    // Konfiguration und aktueller Einwilligungszustand.
    if (!consented || !stillValid()) {
      pauseAdRequests();
      if (currentToken === token) {
        loadPromise = null;
        currentToken = null;
        cachedGeneration = -1;
      }
      return false;
    }
    watchConsentRevocation();
    // Anfragen erst jetzt freigeben – inkl. explizitem NPA-Wert.
    allowAdRequests();
    return true;
  })();

  loadPromise = pending;
  return pending;
}
