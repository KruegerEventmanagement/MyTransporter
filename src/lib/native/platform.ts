/**
 * Plattform-Erkennung für die Capacitor-App.
 * Die App lädt die Live-Website (server.url = PUBLIC_ORIGIN). Dort ist der Web-Build
 * aktiv, deshalb wird die App zur Laufzeit über window.Capacitor erkannt, nicht über
 * ein Build-Flag. IS_NATIVE_BUILD bleibt nur für die gebündelte Notfall-Shell.
 */
export const IS_NATIVE_BUILD = import.meta.env.VITE_MT_NATIVE === "1";

/** Öffentliche Website-Origin: Ziel für Server-Funktionen, Zahlungs- und Auth-Rückkehr. */
export const PUBLIC_ORIGIN: string =
  (import.meta.env.VITE_MT_PUBLIC_ORIGIN as string | undefined) || "https://mytransporter.org"; // kanonisch; www leitet per 307 um (bricht CORS-Preflight)

type CapWindow = { Capacitor?: { isNativePlatform?: () => boolean } };

export function detectNative(win: unknown): boolean {
  try {
    return !!(win as CapWindow | undefined)?.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return detectNative(window);
}

/** Lokale WebView-Origins (capacitor://localhost, https://localhost) dürfen nie an Stripe/Mail. */
export function isLocalShellOrigin(origin: string): boolean {
  return /^(capacitor|ionic):\/\//i.test(origin) || /^https?:\/\/localhost(:\d+)?$/i.test(origin);
}

/**
 * Origin für Links, die außerhalb der App funktionieren müssen (Stripe-Rückkehr,
 * E-Mail-Bestätigung).
 */
export function publicOrigin(): string {
  if (typeof window === "undefined") return PUBLIC_ORIGIN;
  if (IS_NATIVE_BUILD) return PUBLIC_ORIGIN;
  const o = window.location.origin;
  if (isNativeApp() && isLocalShellOrigin(o)) return PUBLIC_ORIGIN;
  return o;
}
