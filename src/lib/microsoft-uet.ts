/**
 * Microsoft Advertising UET (Universal Event Tracking).
 *
 * - Tag-ID (öffentlich): 343274032, Konto 187306713
 * - Wird ausschließlich NACH erteilter Marketing-Einwilligung geladen.
 * - Kein Microsoft Clarity / keine Sitzungsaufzeichnung.
 * - Es werden NIE personenbezogene Daten übertragen – nur Ereignisname,
 *   Kategorie und ggf. der serverseitig verifizierte Buchungswert.
 */

export const UET_TAG_ID = "343274032";
export const UET_SCRIPT_SRC = `https://bat.bing.net/bat.js?ti=${UET_TAG_ID}`;

const SENT_KEY = "mt_uet_conversions_sent";
export const UET_EVENT_CATEGORY = "mytransporter";
export const UET_BOOKING_ACTION = "mytransporter_booking";

type UetInstance = { push: (...args: unknown[]) => void };
type UetConstructor = new (opts: Record<string, unknown>) => UetInstance;

declare global {
  interface Window {
    uetq?: unknown[] | UetInstance;
    UET?: UetConstructor;
  }
}

let scriptInserted = false;
let initialized = false;

function queue(): unknown[] | UetInstance {
  window.uetq = window.uetq ?? [];
  return window.uetq as unknown[] | UetInstance;
}

/**
 * Schreibt in die UET-Queue. Solange das Tag nicht initialisiert ist, ist
 * window.uetq ein Array – dann wird genau ein Argument-Array abgelegt (bat.js
 * arbeitet diese Einträge beim Init ab). Danach übernimmt die UET-Instanz.
 */
function pushArgs(...args: unknown[]): void {
  const q = queue();
  if (Array.isArray(q)) q.push(args);
  else q.push(...args);
}

/** Initialisiert das Tag, sobald bat.js geladen ist (offizielles Snippet). */
function initTag(): void {
  if (initialized || typeof window === "undefined" || !window.UET) return;
  initialized = true;
  const q = (window.uetq ?? []) as unknown[];
  const o = { ti: UET_TAG_ID, q, enableAutoSpaTracking: true };
  window.uetq = new window.UET(o);
  (window.uetq as UetInstance).push("pageLoad");
}

/**
 * Lädt bat.js genau einmal. Nur nach Marketing-Einwilligung aufrufen.
 * Mehrfachaufrufe erzeugen keinen zweiten Loader.
 */
export function ensureMicrosoftUet(): boolean {
  if (typeof window === "undefined") return false;
  queue();
  if (scriptInserted) {
    initTag();
    return true;
  }
  scriptInserted = true;

  if (window.UET) {
    initTag();
    return true;
  }

  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${UET_SCRIPT_SRC}"]`,
  );
  if (existing) {
    existing.addEventListener("load", initTag);
    return true;
  }
  const s = document.createElement("script");
  s.async = true;
  s.src = UET_SCRIPT_SRC;
  s.addEventListener("load", initTag);
  s.addEventListener("error", () => {
    // Fail-closed: kein Event, kein Retry-Sturm.
    scriptInserted = true;
  });
  document.head.appendChild(s);
  return true;
}

/**
 * Widerruf: Nachfolgende Events werden nicht mehr gesendet. Bereits geladenes
 * Script wird nicht erneut initialisiert; nach erneuter Zustimmung kann die
 * bestehende Instanz wiederverwendet werden.
 */
export function resetMicrosoftUetForWithdrawal(): void {
  if (typeof window === "undefined") return;
  // Consent-Signal an Microsoft: Speicherung nicht mehr erlaubt.
  try {
    pushArgs("consent", "update", { ad_storage: "denied" });
  } catch {
    /* ignorieren */
  }
}

/** Consent-Signal „granted“ (Default ist „denied“, siehe setDefaultDenied). */
export function grantMicrosoftUetConsent(): void {
  if (typeof window === "undefined") return;
  pushArgs("consent", "update", { ad_storage: "granted" });
}

/** Default-Denied VOR dem Laden des Tags setzen. */
export function setMicrosoftUetDefaultDenied(): void {
  if (typeof window === "undefined") return;
  pushArgs("consent", "default", { ad_storage: "denied" });
}

function sentIds(): string[] {
  try {
    const raw = window.localStorage.getItem(SENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function remember(id: string): void {
  try {
    const arr = sentIds();
    arr.push(id);
    window.localStorage.setItem(SENT_KEY, JSON.stringify(arr.slice(-50)));
  } catch {
    /* ignorieren */
  }
}

const sentThisSession = new Set<string>();

export type UetBookingConversion = {
  /** Serverseitig bestätigt bezahlt. */
  paid: boolean;
  /** Stabile Buchungs-/Zahlungs-ID zur Deduplizierung. */
  transactionId: string;
  /** Tatsächlich verifizierter Umsatz ohne rückzahlbare Kaution. */
  revenueEur?: number;
};

/**
 * Sendet 'mytransporter_booking' genau einmal pro Buchung – nur bei
 * serverseitig bestätigter Zahlung und erteilter Marketing-Einwilligung.
 */
export function uetTrackBooking(
  conversion: UetBookingConversion,
  hasConsent: boolean,
): boolean {
  if (typeof window === "undefined") return false;
  if (!conversion?.paid || !conversion.transactionId) return false;
  if (!hasConsent) return false;
  if (sentThisSession.has(conversion.transactionId) || sentIds().includes(conversion.transactionId))
    return false;

  sentThisSession.add(conversion.transactionId);
  remember(conversion.transactionId);

  ensureMicrosoftUet();
  const payload: Record<string, unknown> = {
    event_category: UET_EVENT_CATEGORY,
    event_label: conversion.transactionId,
  };
  if (typeof conversion.revenueEur === "number" && conversion.revenueEur > 0) {
    payload.revenue_value = conversion.revenueEur;
    payload.currency = "EUR";
  }
  pushArgs("event", UET_BOOKING_ACTION, payload);
  return true;
}

/** Nur für Tests. */
export function __resetUetForTests(): void {
  scriptInserted = false;
  initialized = false;
  sentThisSession.clear();
}
