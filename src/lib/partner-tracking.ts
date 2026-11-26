/**
 * Partner-/QR-Tracking (client-sicher, ohne Backend-Importe).
 *
 * Regel (dokumentiert, auch im Admin angezeigt):
 * - Ein Scan von /q/<slug> legt serverseitig genau einen anonymen Aufruf an
 *   (nur Partner + Zeitpunkt, keine IP, kein Gerät) und leitet IMMER auf die
 *   eigene Website weiter – auch wenn das Tracking fehlschlägt.
 * - Die Aufruf-ID wird nur mit Marketing-/Analyse-Einwilligung (bestehendes
 *   Consent-Modell, mt_consent_v1 = "marketing") bis zu 30 Tage im Browser
 *   gespeichert. Ohne Einwilligung nur im Arbeitsspeicher der offenen Seite
 *   (geht beim Neuladen verloren); bei Ablehnung/Widerruf wird sie gelöscht.
 *   Letzter Partnerkontakt gewinnt.
 * - Eine Buchung zählt für den Partner, wenn die Zahlung innerhalb von
 *   PARTNER_ATTRIBUTION_DAYS nach dem (serverseitig gespeicherten) Aufruf
 *   gestartet wird.
 */
import { getConsent, type ConsentChoice } from "@/lib/analytics";

export const PARTNER_ATTRIBUTION_DAYS = 30;
export const PARTNER_REF_PARAM = "mt_ref";
export const PARTNER_REF_STORAGE_KEY = "mt_partner_ref_v1";
export const PUBLIC_SITE_ORIGIN = "https://mytransporter.org";

export const PARTNER_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
const TARGET_PATH_RE = /^\/[A-Za-z0-9/_-]*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isPartnerSlug = (s: unknown): s is string => typeof s === "string" && PARTNER_SLUG_RE.test(s);
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);

/** Nur interne Pfade; alles andere (//, http:, \, …) wird zu "/" (kein offener Redirect). */
export function safeTargetPath(p: unknown): string {
  if (typeof p !== "string" || p.length > 120 || !TARGET_PATH_RE.test(p) || p.startsWith("//")) return "/";
  // Kein Ziel auf den QR-Weiterleiter selbst (Schleife).
  if (/^\/q(\/|$)/i.test(p)) return "/";
  return p;
}

/** Relativer Location-Header (immer eigene Domain). */
export function buildPartnerRedirect(targetPath: unknown, visitId: string | null): string {
  const path = safeTargetPath(targetPath);
  return isUuid(visitId) ? `${path}?${PARTNER_REF_PARAM}=${visitId}` : path;
}

export const partnerTrackingUrl = (slug: string) => `${PUBLIC_SITE_ORIGIN}/q/${slug}`;

export function isWithinAttributionWindow(visitedAt: string | Date, now: Date = new Date()): boolean {
  const t = new Date(visitedAt).getTime();
  if (!Number.isFinite(t)) return false;
  const age = now.getTime() - t;
  return age >= -5 * 60_000 && age <= PARTNER_ATTRIBUTION_DAYS * 86_400_000;
}

type StoredRef = { ref: string; seenAt: string };
let pendingRef: StoredRef | null = null;
const valid = (v: Partial<StoredRef> | null): v is StoredRef => !!v && isUuid(v.ref) && !!v.seenAt && isWithinAttributionWindow(v.seenAt);
const consentAllowsPersist = (c: ConsentChoice | null = getConsent()) => c === "marketing";

function persist(win: Window, v: StoredRef) {
  try { win.localStorage.setItem(PARTNER_REF_STORAGE_KEY, JSON.stringify(v)); } catch { /* gesperrt */ }
}
function forget(win: Window) {
  try { win.localStorage.removeItem(PARTNER_REF_STORAGE_KEY); } catch { /* gesperrt */ }
}

/** Übernimmt ?mt_ref=<uuid> (letzter Kontakt gewinnt) und entfernt den Parameter aus der Adresse. */
export function capturePartnerRef(win: Window | undefined = typeof window === "undefined" ? undefined : window): string | null {
  if (!win) return null;
  try {
    const url = new URL(win.location.href);
    const ref = url.searchParams.get(PARTNER_REF_PARAM);
    if (ref !== null) {
      url.searchParams.delete(PARTNER_REF_PARAM);
      try { win.history.replaceState(win.history.state, "", url.pathname + url.search + url.hash); } catch { /* egal */ }
      if (isUuid(ref)) {
        pendingRef = { ref: ref.toLowerCase(), seenAt: new Date().toISOString() };
        if (consentAllowsPersist()) persist(win, pendingRef);
        else forget(win);
      }
    }
  } catch { /* Website funktioniert trotzdem */ }
  if (!consentAllowsPersist()) forget(win);
  return getPartnerRef(win);
}

/** Bei Einwilligung speichern, bei Ablehnung/Widerruf löschen. */
export function applyPartnerConsent(choice: ConsentChoice, win: Window | undefined = typeof window === "undefined" ? undefined : window) {
  if (!win) return;
  if (consentAllowsPersist(choice)) { if (valid(pendingRef)) persist(win, pendingRef); }
  else forget(win);
}

/** Gemerkte Aufruf-ID, falls noch innerhalb des Fensters (Server prüft erneut). */
export function getPartnerRef(win: Window | undefined = typeof window === "undefined" ? undefined : window): string | null {
  if (!win) return null;
  if (consentAllowsPersist()) {
    try {
      const raw = win.localStorage.getItem(PARTNER_REF_STORAGE_KEY);
      const v = raw ? (JSON.parse(raw) as Partial<StoredRef>) : null;
      if (valid(v)) return v.ref;
    } catch { /* fällt auf Arbeitsspeicher zurück */ }
  }
  return valid(pendingRef) ? pendingRef.ref : null;
}

/** Nur für Tests. */
export function __resetPartnerRefMemory() { pendingRef = null; }

// ---------------- Provision ----------------

/** Buchungsstatus, für die tatsächlich bezahlt wurde und die nicht storniert sind. */
export const COMMISSIONABLE_STATUSES = ["paid", "active", "returning", "completed"] as const;
/** Erstattungen, die die Miete mindern (Kautionserstattungen nie). */
const RENT_REDUCING_ALLOCATIONS = new Set(["cancellation", "conflict", "unallocated"]);

export type CommissionBooking = { status: string; plan_price: number | string | null; addons_total_cents: number | null };
export type CommissionRefund = { refund_id: string; amount_cents: number; status: string; allocation: string };

/**
 * Grundlage: bezahlter Brutto-Mietpreis nach Rabatt (plan_price) + Zusatzpakete,
 * OHNE Kaution, minus Erstattungen auf die Miete. Refunds werden per refund_id
 * dedupliziert (mehrfach gelieferte Events zählen einmal). Provision centgenau
 * kaufmännisch gerundet, nie negativ.
 */
export function computePartnerCommission(b: CommissionBooking, refunds: CommissionRefund[], rateBp: number) {
  const eligible = (COMMISSIONABLE_STATUSES as readonly string[]).includes(b.status);
  const rentCents = Math.max(0, Math.round(Number(b.plan_price ?? 0) * 100) + Math.max(0, Math.round(Number(b.addons_total_cents ?? 0))));
  const seen = new Set<string>();
  let refundedCents = 0;
  for (const r of refunds) {
    if (seen.has(r.refund_id)) continue;
    seen.add(r.refund_id);
    if (r.status === "failed" || r.status === "canceled") continue;
    if (!RENT_REDUCING_ALLOCATIONS.has(r.allocation)) continue;
    refundedCents += Math.max(0, Math.round(r.amount_cents));
  }
  const baseCents = eligible ? Math.max(0, rentCents - refundedCents) : 0;
  const rate = Math.max(0, Math.min(5000, Math.round(rateBp)));
  return { eligible, rentCents, refundedCents: Math.min(refundedCents, rentCents), baseCents, commissionCents: Math.round((baseCents * rate) / 10000) };
}

export const formatEuro = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
