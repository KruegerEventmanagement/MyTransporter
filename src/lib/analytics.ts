/**
 * Zentrale Conversion-/Analytics-Hooks.
 *
 * ACHTUNG: Hier wird aktuell BEWUSST kein Tracking ausgeführt. Es sind keine
 * GA4-Messwert-IDs (G-…) oder Google-Ads-Conversion-Labels (AW-…/…) hinterlegt.
 * Sobald die echten IDs vorliegen, wird ausschließlich in diesem Modul
 * implementiert (inkl. Consent-Prüfung) – die Aufrufstellen bleiben unverändert.
 */

export type ConversionEvent =
  | { name: "booking_start" }
  | { name: "checkout_start"; valueEur: number; planId: string }
  | { name: "purchase"; valueEur: number; transactionId: string }
  | { name: "contact_submit" }
  | { name: "phone_click" };

/** Erlaubt Tracking nur, wenn Marketing-Consent vorliegt. Aktuell immer false. */
export function hasMarketingConsent(): boolean {
  return false;
}

/** No-Op-Dispatcher: feuert nichts, bis IDs + Consent-Banner angeschlossen sind. */
export function trackConversion(event: ConversionEvent): void {
  if (!hasMarketingConsent()) return;
  // Platzhalter: hier später gtag('event', …) mit echten IDs.
  void event;
}
