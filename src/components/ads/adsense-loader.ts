/**
 * Einmaliges, asynchrones Laden des AdSense-Scripts – nur wenn die
 * Konfiguration vollständig gültig ist UND ein echter, geprüfter CMP-Adapter
 * eine Einwilligung bestätigt. Ohne beides wird keine externe Anfrage
 * ausgelöst (fail-closed).
 */

import { ADSENSE_CONFIG, isAdSenseConfigured, type AdSenseConfig } from "@/lib/adsense";
import { requestAdConsent, subscribeAdConsent } from "@/lib/adsense-consent";

let loadPromise: Promise<boolean> | null = null;
let consentWatcher: (() => void) | null = null;
let currentToken: object | null = null;

/** Setzt den Ladezustand zurück (z. B. nach Widerruf der Einwilligung). */
export function resetAdSenseScriptLoad(): void {
  loadPromise = null;
}

function watchConsentRevocation() {
  if (consentWatcher) return;
  consentWatcher = subscribeAdConsent((consented) => {
    if (!consented) resetAdSenseScriptLoad();
  });
}

export function ensureAdSenseScript(config: AdSenseConfig = ADSENSE_CONFIG): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(false);
  if (!isAdSenseConfigured(config)) return Promise.resolve(false);
  if (loadPromise) return loadPromise;

  const token = {};
  currentToken = token;
  const pending = (async () => {
    const consented = await requestAdConsent();
    if (!consented) {
      // Kein Script, keine Anfrage. Erneuter Versuch nach Consent-Änderung möglich.
      if (currentToken === token) loadPromise = null;
      return false;
    }
    watchConsentRevocation();
    return new Promise<boolean>((resolve) => {
      const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
        config.publisherId,
      )}`;
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
      if (existing) return resolve(true);
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = () => resolve(true);
      script.onerror = () => {
        if (currentToken === token) loadPromise = null;
        resolve(false);
      };
      document.head.appendChild(script);
    });
  })();

  loadPromise = pending;
  return pending;
}
