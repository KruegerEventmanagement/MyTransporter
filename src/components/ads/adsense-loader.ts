/**
 * Einmaliges, asynchrones Laden des AdSense-Scripts – nur wenn die
 * Konfiguration vollständig gültig ist UND eine CMP-Einwilligung vorliegt.
 * Ohne beides wird keine externe Anfrage ausgelöst (fail-closed).
 */

import { ADSENSE_CONFIG, isAdSenseConfigured, type AdSenseConfig } from "@/lib/adsense";
import { requestAdConsent } from "@/lib/adsense-consent";

let loadPromise: Promise<boolean> | null = null;

export function ensureAdSenseScript(config: AdSenseConfig = ADSENSE_CONFIG): Promise<boolean> {
  if (loadPromise) return loadPromise;
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(false);
  if (!isAdSenseConfigured(config)) return Promise.resolve(false);

  loadPromise = (async () => {
    const consented = await requestAdConsent();
    if (!consented) {
      // Kein Script, keine Anfrage. Erneuter Versuch nach Consent-Änderung möglich.
      loadPromise = null;
      return false;
    }
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
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  })();

  return loadPromise;
}
