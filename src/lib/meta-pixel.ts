/**
 * Meta Pixel (Facebook) – lädt ausschließlich nach Marketing-Einwilligung.
 *
 * Die Pixel-ID kommt ausschließlich aus der öffentlichen Env-Variable
 * VITE_META_PIXEL_ID. Ist sie nicht gesetzt, passiert nichts (kein Crash,
 * kein ungültiger Request).
 *
 * Es werden NIE personenbezogene Daten (Name, E-Mail, Telefon, Ausweis-/
 * Führerscheindaten, Fotos) übertragen – nur Wert, Währung und IDs.
 */

export const META_PIXEL_ID =
  (import.meta.env.VITE_META_PIXEL_ID as string | undefined)?.trim() || "";

type FbqFn = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

let loaded = false;

export function isMetaPixelConfigured(): boolean {
  return META_PIXEL_ID.length > 0;
}

/** Lädt das Pixel-Script genau einmal. Nur nach Einwilligung aufrufen. */
export function ensureMetaPixel(): boolean {
  if (typeof window === "undefined" || !META_PIXEL_ID) return false;
  if (loaded) return true;
  loaded = true;

  if (!window.fbq) {
    const fbq: FbqFn = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue?.push(args);
    } as FbqFn;
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.push = fbq;
    window.fbq = fbq;
    window._fbq = fbq;
  }

  const src = "https://connect.facebook.net/en_US/fbevents.js";
  if (!document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)) {
    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  window.fbq?.("init", META_PIXEL_ID);
  window.fbq?.("track", "PageView");
  return true;
}

/** Sendet ein Standard-Event an Meta (nur wenn Pixel konfiguriert/geladen). */
export function metaTrack(
  eventName: string,
  params?: Record<string, unknown>,
  eventID?: string,
): void {
  if (typeof window === "undefined" || !META_PIXEL_ID) return;
  if (!ensureMetaPixel()) return;
  window.fbq?.("track", eventName, params ?? {}, eventID ? { eventID } : undefined);
}
