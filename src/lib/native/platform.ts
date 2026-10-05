/**
 * Plattform-Erkennung für die Capacitor-App. Im Web-Build ist IS_NATIVE_BUILD
 * immer false, damit Browser/PWA-Verhalten unverändert bleibt.
 */
export const IS_NATIVE_BUILD = import.meta.env.VITE_MT_NATIVE === "1";

/** Öffentliche Website-Origin: Ziel für Server-Funktionen, Zahlungs- und Auth-Rückkehr. */
export const PUBLIC_ORIGIN: string =
  (import.meta.env.VITE_MT_PUBLIC_ORIGIN as string | undefined) || "https://www.mytransporter.org";

export function isNativeApp(): boolean {
  if (!IS_NATIVE_BUILD || typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/**
 * Origin für Links, die außerhalb der App funktionieren müssen (Stripe-Rückkehr,
 * E-Mail-Bestätigung). In der App ist window.location.origin capacitor://localhost
 * bzw. https://localhost und darf nie an Stripe/Mail übergeben werden.
 */
export function publicOrigin(): string {
  if (typeof window === "undefined") return PUBLIC_ORIGIN;
  if (IS_NATIVE_BUILD) return PUBLIC_ORIGIN;
  return window.location.origin;
}
