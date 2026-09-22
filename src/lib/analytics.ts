/**
 * Zentrale Google-Ads-Integration (Consent Mode v2).
 *
 * - Google-Tag-ID (Conversion-ID): AW-18092739278
 * - Conversion-Action "MyTransporter – Buchung" (ID 7734092772)
 * - Das Conversion-LABEL ist bewusst NICHT im Code hinterlegt. Es wird
 *   ausschließlich über die Env-Variable VITE_GOOGLE_ADS_PURCHASE_LABEL gesetzt.
 *   Fehlt sie, wird kein Conversion-Event gesendet (kein Fehler, kein Crash).
 */

import { ensureMetaPixel, metaTrack } from "./meta-pixel";
import {
  ensureMicrosoftUet,
  grantMicrosoftUetConsent,
  resetMicrosoftUetForWithdrawal,
  setMicrosoftUetDefaultDenied,
  uetTrackBooking,
} from "./microsoft-uet";

export const GOOGLE_ADS_ID = "AW-18092739278";

const PURCHASE_LABEL = (import.meta.env.VITE_GOOGLE_ADS_PURCHASE_LABEL as string | undefined)?.trim() || "";

export const CONSENT_STORAGE_KEY = "mt_consent_v1";
const SENT_CONVERSIONS_KEY = "mt_ads_conversions_sent";

export type ConsentChoice = "necessary" | "marketing";

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}

/* ------------------------------------------------------------------ Consent */

export function getConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return v === "marketing" || v === "necessary" ? v : null;
  } catch {
    return null;
  }
}

export function hasMarketingConsent(): boolean {
  return getConsent() === "marketing";
}

const listeners = new Set<(c: ConsentChoice) => void>();

export function onConsentChange(fn: (c: ConsentChoice) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setConsent(choice: ConsentChoice): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    /* Storage kann blockiert sein – Consent gilt dann nur für diese Session */
  }
  if (choice === "marketing") {
    ensureGoogleTag();
    ensureMetaPixel();
    // Microsoft UET: Default „denied“ vor dem Laden, danach „granted“.
    setMicrosoftUetDefaultDenied();
    ensureMicrosoftUet();
    grantMicrosoftUetConsent();
    applyConsent(true);
  } else {
    resetMicrosoftUetForWithdrawal();
    applyConsent(false);
  }
  listeners.forEach((fn) => fn(choice));
}

/* ------------------------------------------------------------------- gtag */

function gtag(...args: unknown[]): void {
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(args);
}

function applyConsent(granted: boolean): void {
  if (typeof window === "undefined") return;
  const state = granted ? "granted" : "denied";
  gtag("consent", "update", {
    ad_storage: state,
    ad_user_data: state,
    ad_personalization: state,
    analytics_storage: state,
  });
}

let tagLoaded = false;

/**
 * Lädt gtag.js genau einmal und setzt vorab alle Consent-Signale auf "denied"
 * (Consent Mode v2 Defaults). Wird nur nach Marketing-Einwilligung aufgerufen.
 */
export function ensureGoogleTag(): void {
  if (typeof window === "undefined" || tagLoaded) return;
  tagLoaded = true;

  window.dataLayer = window.dataLayer ?? [];
  if (!window.gtag) window.gtag = gtag;

  // Defaults VOR dem Laden des Tags: nichts erlaubt.
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    wait_for_update: 500,
  });

  const existing = document.querySelector<HTMLScriptElement>(
    `script[src*="googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}"]`,
  );
  if (!existing) {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`;
    document.head.appendChild(s);
  }

  gtag("js", new Date());
  gtag("config", GOOGLE_ADS_ID, { send_page_view: false });
}

/* ------------------------------------------------ Interne Struktur-Events */

export type InternalEvent =
  | { name: "booking_start" }
  | { name: "checkout_start"; valueEur: number; planId: string }
  | { name: "phone_click" };

/**
 * Interne, nicht-conversion Events. Sie werden nur bei Marketing-Einwilligung
 * an gtag weitergegeben und erzeugen KEINE Google-Ads-Conversion-Aktion.
 */
export function trackEvent(event: InternalEvent): void {
  if (typeof window === "undefined") return;
  if (!hasMarketingConsent()) return;
  ensureGoogleTag();
  ensureMetaPixel();
  const { name, ...params } = event;
  window.gtag?.("event", name, params);
  if (name === "checkout_start") {
    const { valueEur } = event as { valueEur: number };
    // Verbindlicher Checkout-Start, aber NOCH KEINE Zahlung → InitiateCheckout.
    metaTrack("InitiateCheckout", { currency: "EUR", value: valueEur });
  }
}

/* -------------------------------------------- CompleteRegistration (Meta) */

const REGISTRATIONS_KEY = "mt_meta_registrations_sent";

function sentIds(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function rememberId(key: string, id: string): void {
  try {
    const arr = sentIds(key);
    arr.push(id);
    window.localStorage.setItem(key, JSON.stringify(arr.slice(-50)));
  } catch {
    /* ignorieren */
  }
}

/**
 * Feuert genau einmal pro User-ID, nachdem die Registrierung serverseitig
 * abgeschlossen ist (Auth-User existiert). Es werden keine personenbezogenen
 * Daten übergeben – nur eine anonyme Event-ID zur Deduplizierung.
 */
export function trackCompleteRegistration(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  if (!hasMarketingConsent()) return;
  if (sentIds(REGISTRATIONS_KEY).includes(userId)) return;
  rememberId(REGISTRATIONS_KEY, userId);

  ensureGoogleTag();
  window.gtag?.("event", "sign_up", { method: "email" });
  metaTrack("CompleteRegistration", { status: true }, `reg_${userId}`);
}


/* ---------------------------------------------------------- Purchase/Ads */

export type VerifiedPurchase = {
  /** Serverseitig bestätigt bezahlt */
  paid: boolean;
  /** Echter Umsatz ohne rückzahlbare Kaution */
  conversionValueEur: number;
  currency: string;
  /** Stripe PaymentIntent (bevorzugt), sonst Checkout-Session-ID */
  transactionId: string;
};

function alreadySent(transactionId: string): boolean {
  try {
    const raw = window.localStorage.getItem(SENT_CONVERSIONS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) && list.includes(transactionId);
  } catch {
    return false;
  }
}

function markSent(transactionId: string): void {
  try {
    const raw = window.localStorage.getItem(SENT_CONVERSIONS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    const arr = Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
    arr.push(transactionId);
    window.localStorage.setItem(SENT_CONVERSIONS_KEY, JSON.stringify(arr.slice(-50)));
  } catch {
    /* ignorieren */
  }
}

const sentThisSession = new Set<string>();

/** Merker für Nachholen, falls Consent erst nach der Zahlung erteilt wird. */
let pendingPurchase: VerifiedPurchase | null = null;

/**
 * Sendet die Google-Ads-Purchase-Conversion genau einmal pro transaction_id.
 * Voraussetzungen: serverseitig bestätigte Zahlung, Marketing-Einwilligung und
 * gesetztes VITE_GOOGLE_ADS_PURCHASE_LABEL.
 */
export function trackPurchase(purchase: VerifiedPurchase): void {
  if (typeof window === "undefined") return;
  if (!purchase?.paid || !purchase.transactionId) return;
  if (!(purchase.conversionValueEur > 0)) return;

  if (!hasMarketingConsent()) {
    // Nicht senden – aber für ein einmaliges Nachholen in dieser Session merken.
    pendingPurchase = purchase;
    return;
  }
  if (sentThisSession.has(purchase.transactionId) || alreadySent(purchase.transactionId)) return;

  sentThisSession.add(purchase.transactionId);
  markSent(purchase.transactionId);

  // Meta Purchase – nur Wert, Währung und stabile Zahlungs-ID (keine PII).
  metaTrack(
    "Purchase",
    { currency: "EUR", value: purchase.conversionValueEur },
    purchase.transactionId,
  );

  if (!PURCHASE_LABEL) {
    // Google-Ads-Label nicht gesetzt: bewusst kein Google-Event, kein Fehler.
    return;
  }

  ensureGoogleTag();
  window.gtag?.("event", "conversion", {
    send_to: `${GOOGLE_ADS_ID}/${PURCHASE_LABEL}`,
    value: purchase.conversionValueEur,
    currency: "EUR",
    transaction_id: purchase.transactionId,
  });
}

// Nachholen, sobald Marketing-Einwilligung erteilt wird.
if (typeof window !== "undefined") {
  onConsentChange((choice) => {
    if (choice === "marketing" && pendingPurchase) {
      const p = pendingPurchase;
      pendingPurchase = null;
      trackPurchase(p);
    }
  });
}
