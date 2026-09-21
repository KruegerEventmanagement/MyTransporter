/**
 * Einwilligungs-Grenze für Google-Anzeigen.
 *
 * STAND: Es ist KEINE zertifizierte Google-CMP eingebunden. Dieses Modul ist
 * deshalb ein bewusst geschlossener Integrationspunkt und liefert IMMER `false`,
 * bis ein echter, geprüfter CMP-Adapter implementiert und registriert ist.
 *
 * Es gibt hier absichtlich KEINE Ersatz-/Fake-CMP, keine Umdeutung der
 * bestehenden Marketing-Einwilligung aus dem Cookie-Banner (die gilt nur für
 * Google Ads Conversion-Tracking und Meta) und keine unvollständige
 * TCF-Abfrage, die nach fertiger Integration aussieht.
 *
 * Vor der Aktivierung MUSS der Adapter vollständig umgesetzt werden:
 *  - Einbindung einer von Google zertifizierten CMP (TCF v2.2) inkl. Message
 *  - Prüfung des Google-Vendors (Google Advertising Products) und aller
 *    benötigten Zwecke/Legitimate-Interest-Angaben, nicht nur Purpose 1
 *  - `__tcfapi("addEventListener", 2, ...)` für laufende Consent-Änderungen
 *  - Widerruf: laufende Anzeigen entfernen, Script-Ladezustand zurücksetzen
 *  - Dokumentierter manueller Test (Zustimmung, Ablehnung, Widerruf, Timeout)
 *
 * Konfigurationsflags allein (`enabled`, `certifiedCmpConfigured`) aktivieren
 * NICHTS, solange hier kein Adapter registriert ist.
 */

export interface AdConsentAdapter {
  /** Eindeutiger Name des zertifizierten CMP-Anbieters. */
  provider: string;
  /** Liefert true nur bei vollständiger, geprüfter Einwilligung für Google-Anzeigen. */
  hasAdConsent: (timeoutMs: number) => Promise<boolean>;
  /** Registriert einen Listener für Consent-Änderungen/Widerruf. */
  subscribe: (onChange: (consented: boolean) => void) => () => void;
}

let adapter: AdConsentAdapter | null = null;

/**
 * Registriert den echten CMP-Adapter. Wird erst aufgerufen, wenn die
 * zertifizierte CMP eingebunden und verifiziert ist.
 */
export function registerAdConsentAdapter(next: AdConsentAdapter): void {
  adapter = next;
}

/** Ist ein echter, geprüfter CMP-Adapter registriert? */
export function hasAdConsentAdapter(): boolean {
  return adapter !== null;
}

/**
 * Fail-closed Einwilligungsabfrage: ohne registrierten Adapter immer false.
 */
export async function requestAdConsent(timeoutMs = 3000): Promise<boolean> {
  if (!adapter) return false;
  try {
    return (await adapter.hasAdConsent(timeoutMs)) === true;
  } catch {
    return false;
  }
}

/** Abonniert Consent-Änderungen; ohne Adapter passiert nichts. */
export function subscribeAdConsent(onChange: (consented: boolean) => void): () => void {
  if (!adapter) return () => {};
  try {
    return adapter.subscribe(onChange);
  } catch {
    return () => {};
  }
}
