/**
 * Zentrale, typisierte AdSense-Konfiguration.
 *
 * WICHTIG: Standardmäßig komplett deaktiviert und ohne IDs. Solange hier keine
 * echten Werte stehen und keine zertifizierte CMP-Einwilligung vorliegt, wird
 * KEIN Google-Script geladen und KEINE Anfrage an Google gesendet (fail-closed).
 */

export type AdSenseSlotKey =
  | "railLeft"
  | "railRight"
  | "inlineContent";

export type AdSenseSlots = Partial<Record<AdSenseSlotKey, string>>;

export interface AdSenseConfig {
  /** Master-Schalter. Erst auf true setzen, wenn alles unten erfüllt ist. */
  enabled: boolean;
  /** Echte Publisher-ID im Format ca-pub-0000000000000000. Leer = nicht konfiguriert. */
  publisherId: string;
  /** Echte Slot-IDs (nur Ziffern) je Platzierung. Leer = Platzierung inaktiv. */
  slots: AdSenseSlots;
  /** Auto Ads bleiben absichtlich aus. */
  autoAds: boolean;
  /** Site-Freigabe durch Google erfolgt? Ohne true keine Anfragen. */
  siteApproved: boolean;
  /** Zertifizierte Google-CMP eingebunden? Ohne true keine Anfragen. */
  certifiedCmpConfigured: boolean;
  /**
   * Wurde die echte Einwilligungsmeldung auf der öffentlichen Domain
   * tatsächlich geprüft (Zustimmen/Ablehnen/Widerruf/Rendering)? Ohne true
   * keine Anzeigenanfragen.
   */
  liveCmpVerified: boolean;
}

export const ADSENSE_CONFIG: AdSenseConfig = {
  enabled: false,
  publisherId: "ca-pub-6974851907377988",
  // Echte, im AdSense-Konto erzeugte Responsive-Display-Einheiten.
  // railLeft  = "MyTransporter – Seitenleiste links"
  // railRight = "MyTransporter – Seitenleiste rechts"
  slots: {
    railLeft: "4238348588",
    railRight: "6950298526",
  },
  autoAds: false,
  siteApproved: false,
  certifiedCmpConfigured: false,
  liveCmpVerified: false,
};

const PUBLISHER_ID_RE = /^ca-pub-\d{16}$/;
const SLOT_ID_RE = /^\d{6,16}$/;

export function isValidPublisherId(value: string): boolean {
  return PUBLISHER_ID_RE.test(value.trim());
}

export function isValidSlotId(value: string | undefined): boolean {
  return typeof value === "string" && SLOT_ID_RE.test(value.trim());
}

/** Strenge Validierung: nur vollständig korrekte Konfiguration ist einsatzbereit. */
export function validateAdSenseConfig(config: AdSenseConfig = ADSENSE_CONFIG): string[] {
  const problems: string[] = [];
  if (!config.enabled) problems.push("AdSense ist deaktiviert (enabled=false).");
  if (!isValidPublisherId(config.publisherId)) problems.push("Ungültige oder fehlende Publisher-ID.");
  if (!config.siteApproved) problems.push("Website ist bei Google nicht freigegeben.");
  if (!config.certifiedCmpConfigured) problems.push("Keine zertifizierte CMP konfiguriert.");
  const slotKeys = Object.keys(config.slots) as AdSenseSlotKey[];
  if (slotKeys.length === 0) problems.push("Keine Slot-IDs konfiguriert.");
  for (const key of slotKeys) {
    if (!isValidSlotId(config.slots[key])) problems.push(`Ungültige Slot-ID für ${key}.`);
  }
  return problems;
}

/** true nur, wenn die Konfiguration komplett und gültig ist. */
export function isAdSenseConfigured(config: AdSenseConfig = ADSENSE_CONFIG): boolean {
  return validateAdSenseConfig(config).length === 0;
}

/** Gültige Slot-ID oder null. */
export function getSlotId(
  key: AdSenseSlotKey,
  config: AdSenseConfig = ADSENSE_CONFIG,
): string | null {
  const value = config.slots[key];
  return isValidSlotId(value) ? value!.trim() : null;
}

/** Eine Platzierung darf nur mit gültiger Gesamtkonfiguration und gültigem Slot laufen. */
export function isSlotReady(
  key: AdSenseSlotKey,
  config: AdSenseConfig = ADSENSE_CONFIG,
): boolean {
  return isAdSenseConfigured(config) && getSlotId(key, config) !== null;
}
