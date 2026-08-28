/**
 * First-Touch-Attribution (UTM + gclid/fbclid).
 *
 * Wird ausschließlich lokal im Browser gespeichert und NIE an Werbeplattformen
 * gesendet. Enthält bewusst keine personenbezogenen Daten (keine Namen,
 * E-Mails, Telefonnummern, Dokumentendaten).
 */

const STORAGE_KEY = "mt_attribution_v1";

const PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
] as const;

export type Attribution = Partial<Record<(typeof PARAMS)[number], string>> & {
  landing_path?: string;
  first_seen?: string;
};

function read(): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Attribution) : null;
  } catch {
    return null;
  }
}

/** Speichert die erste erkannte Kampagnenquelle (First-Touch, nicht überschreibend). */
export function captureAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  const existing = read();
  if (existing) return existing;

  const sp = new URLSearchParams(window.location.search);
  const found: Attribution = {};
  for (const key of PARAMS) {
    const v = sp.get(key);
    if (v) found[key] = v.slice(0, 200);
  }
  if (Object.keys(found).length === 0) return null;

  found.landing_path = window.location.pathname;
  found.first_seen = new Date().toISOString();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(found));
  } catch {
    /* Storage kann blockiert sein */
  }
  return found;
}

/** First-Touch-Attribution, falls vorhanden. */
export function getAttribution(): Attribution | null {
  return read();
}
