/**
 * Freigabe für echte Anzeigenanfragen.
 *
 * Das Google-Script wird ausschließlich vom CMP-Bootstrap geladen (damit die
 * Einwilligungsmeldung überhaupt erscheinen kann, siehe adsense-cmp.ts) und
 * startet immer mit `pauseAdRequests = 1`. Diese Funktion gibt Anfragen nur
 * frei, wenn die Konfiguration vollständig einsatzbereit ist, der QA-Modus
 * NICHT aktiv ist und die echte CMP eine vollständige Einwilligung bestätigt.
 */

import { ADSENSE_CONFIG, isAdSenseConfigured, type AdSenseConfig } from "@/lib/adsense";
import { requestAdConsent, subscribeAdConsent } from "@/lib/adsense-consent";
import { areAdRequestsAllowed, pauseAdRequests } from "@/lib/adsense-cmp";

let loadPromise: Promise<boolean> | null = null;
let consentWatcher: (() => void) | null = null;
let currentToken: object | null = null;

/** Setzt den Freigabezustand zurück (z. B. nach Widerruf der Einwilligung). */
export function resetAdSenseScriptLoad(): void {
  loadPromise = null;
}

function watchConsentRevocation() {
  if (consentWatcher) return;
  consentWatcher = subscribeAdConsent((consented) => {
    if (!consented) {
      resetAdSenseScriptLoad();
      pauseAdRequests();
    }
  });
}

export function ensureAdSenseScript(config: AdSenseConfig = ADSENSE_CONFIG): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(false);
  if (!isAdSenseConfigured(config)) return Promise.resolve(false);
  if (!areAdRequestsAllowed({ config })) return Promise.resolve(false);
  if (loadPromise) return loadPromise;

  const token = {};
  currentToken = token;
  const pending = (async () => {
    const consented = await requestAdConsent();
    if (!consented) {
      // Keine Anfrage. Erneuter Versuch nach Consent-Änderung möglich.
      pauseAdRequests();
      if (currentToken === token) loadPromise = null;
      return false;
    }
    watchConsentRevocation();
    // Anfragen erst jetzt freigeben.
    const w = window as unknown as { adsbygoogle?: Array<unknown> & { pauseAdRequests?: number } };
    if (w.adsbygoogle) w.adsbygoogle.pauseAdRequests = 0;
    return true;
  })();

  loadPromise = pending;
  return pending;
}
