/**
 * Einwilligungsprüfung für Google-Anzeigen – ausschließlich über eine
 * zertifizierte Google-CMP (TCF v2 `__tcfapi`).
 *
 * Es gibt hier absichtlich KEINE Ersatz-/Fake-CMP und KEINE Umdeutung der
 * bestehenden Marketing-Einwilligung aus dem Cookie-Banner (die gilt nur für
 * Google Ads Conversion-Tracking und Meta, nicht für AdSense/TCF).
 * Ohne CMP-Antwort: keine Einwilligung, keine Anfrage.
 */

type TcfApi = (
  command: string,
  version: number,
  callback: (data: unknown, success: boolean) => void,
) => void;

function getTcfApi(): TcfApi | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { __tcfapi?: TcfApi }).__tcfapi;
  return typeof api === "function" ? api : null;
}

/** Ist überhaupt eine CMP im Seitenkontext vorhanden? */
export function hasCmp(): boolean {
  return getTcfApi() !== null;
}

/**
 * Fragt die CMP nach einer gültigen Einwilligung für Werbeanzeigen.
 * Ergebnis ist fail-closed: false bei fehlender CMP, Fehler oder Timeout.
 */
export function requestAdConsent(timeoutMs = 3000): Promise<boolean> {
  const api = getTcfApi();
  if (!api) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);

    try {
      api("getTCData", 2, (data, success) => {
        clearTimeout(timer);
        if (!success || !data || typeof data !== "object") return finish(false);
        const d = data as {
          gdprApplies?: boolean;
          purpose?: { consents?: Record<string, boolean> };
        };
        // Ohne GDPR-Anwendbarkeit gilt die CMP-Antwort als vorhanden, aber wir
        // verlangen dennoch eine positive Zweck-1-Einwilligung, wenn vorhanden.
        const purposeOne = d.purpose?.consents?.["1"] === true;
        if (d.gdprApplies === false) return finish(true);
        finish(purposeOne);
      });
    } catch {
      clearTimeout(timer);
      finish(false);
    }
  });
}
