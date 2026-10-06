/**
 * Zentrale, routenabhängige AdSense-Platzierungsrichtlinie.
 *
 * Einzige Quelle für: welche öffentlichen Seiten überhaupt Anzeigen/CMP
 * erhalten (Allowlist) und wie viele logische Plätze je Seite erlaubt sind.
 * Unbekannte Pfade = keine Richtlinie = keine Anzeigen, keine CMP (fail-closed).
 *
 * Logische Plätze (max. 6 je langer Seite):
 *  - railLeftTop / railLeftLower / railRightTop / railRightLower: nur Desktop ab 1280 px,
 *    im Seitenfluss (nicht sticky), der untere Platz weit unterhalb neben weiterem Inhalt.
 *  - inFlowTop / inFlowBottom: im Inhaltsfluss; ab 768 px als Inline-Einheit,
 *    auf Handys (< 768 px) als Mobil-Einheit. Viewports sind disjunkt, daher
 *    nie doppelt im selben Viewport.
 */

import type { AdSenseSlotKey } from "./adsense";

export type AdPlacement =
  | "railLeftTop"
  | "railLeftLower"
  | "railRightTop"
  | "railRightLower"
  | "inFlowTop"
  | "inFlowBottom";

export type InFlowViewport = "mobile" | "wide";

export interface RouteAdPolicy {
  /** 0–2 Rails je Seite (links und rechts gleich). */
  railsPerSide: 0 | 1 | 2;
  /** 0–2 In-Flow-Plätze ab 768 px. */
  inFlowWide: 0 | 1 | 2;
  /** 0–2 In-Flow-Plätze auf Handys. */
  inFlowMobile: 0 | 1 | 2;
}

const LONG: RouteAdPolicy = { railsPerSide: 2, inFlowWide: 2, inFlowMobile: 2 };
const MEDIUM: RouteAdPolicy = { railsPerSide: 1, inFlowWide: 1, inFlowMobile: 1 };

/**
 * Tatsächliche öffentliche Seiten mit Anzeigen. Nicht enthalten (werbefrei):
 * /werbeflaeche (Affiliate), /werbung (eigene Angebote + Formulare), Login,
 * Reset, Profil, Buchung, Checkout, Fahrt, Admin, Impressum, Datenschutz, AGB …
 */
export const ROUTE_AD_POLICIES: Readonly<Record<string, RouteAdPolicy>> = {
  "/": LONG, // Marketing-Teil; Buchungswizard unterdrückt ab erster Interaktion
  "/preise": LONG,
  "/faq": LONG,
  "/umzug": LONG,
  "/mietratgeber": LONG,
  "/umzugstransporter-mieten": LONG,
  "/transporter-mieten-pforzheim-calw": LONG,
  "/ueber-uns": MEDIUM,
  // Nur unterhalb des Rechners im Erklärungsteil, keine Rails neben dem Rechner.
  "/langzeitmiete": { railsPerSide: 0, inFlowWide: 1, inFlowMobile: 1 },
  // Kurze Seite: je eine Rail neben den Informationen, nichts im Inhalt.
  "/kontakt": { railsPerSide: 1, inFlowWide: 0, inFlowMobile: 0 },
};

export const AD_ALLOWED_PATHS: readonly string[] = Object.freeze(Object.keys(ROUTE_AD_POLICIES));

function normalize(pathname: string | undefined | null): string | null {
  if (!pathname) return null;
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function getRouteAdPolicy(pathname: string | undefined | null): RouteAdPolicy | null {
  const clean = normalize(pathname);
  if (!clean) return null;
  return Object.prototype.hasOwnProperty.call(ROUTE_AD_POLICIES, clean) ? ROUTE_AD_POLICIES[clean]! : null;
}

const RAIL_SLOTS: Record<"railLeftTop" | "railLeftLower" | "railRightTop" | "railRightLower", AdSenseSlotKey> = {
  railLeftTop: "railLeft",
  railLeftLower: "railLeftLower",
  railRightTop: "railRight",
  railRightLower: "railRightLower",
};

const IN_FLOW_SLOTS: Record<"inFlowTop" | "inFlowBottom", Record<InFlowViewport, AdSenseSlotKey>> = {
  inFlowTop: { wide: "inlineTop", mobile: "mobileTop" },
  inFlowBottom: { wide: "inlineBottom", mobile: "mobileBottom" },
};

/**
 * Liefert die Slot-Einheit für einen logischen Platz auf einer Route, oder
 * null, wenn Route/Platz/Viewport nicht erlaubt sind. Prüft NICHT, ob eine
 * echte ID hinterlegt ist (das macht isSlotReady pro Slot).
 */
export function placementSlotFor(
  pathname: string | undefined | null,
  placement: AdPlacement,
  viewport?: InFlowViewport,
): AdSenseSlotKey | null {
  const policy = getRouteAdPolicy(pathname);
  if (!policy) return null;
  if (placement === "inFlowTop" || placement === "inFlowBottom") {
    if (!viewport) return null;
    const limit = viewport === "mobile" ? policy.inFlowMobile : policy.inFlowWide;
    const index = placement === "inFlowTop" ? 1 : 2;
    return limit >= index ? IN_FLOW_SLOTS[placement][viewport] : null;
  }
  const index = placement.endsWith("Top") ? 1 : 2;
  return policy.railsPerSide >= index ? RAIL_SLOTS[placement] : null;
}

/** Höchstzahl gleichzeitig möglicher Plätze je Viewport (für Tests/Doku). */
export function maxPlacementsFor(pathname: string, viewport: "desktop" | "mobile"): number {
  const p = getRouteAdPolicy(pathname);
  if (!p) return 0;
  return viewport === "mobile" ? p.inFlowMobile : p.railsPerSide * 2 + p.inFlowWide;
}

/* Laufzeit-Schutz: jeder logische Platz höchstens einmal gleichzeitig. */
const claims = new Map<AdPlacement, symbol>();

export function claimPlacement(placement: AdPlacement, owner: symbol): boolean {
  const current = claims.get(placement);
  if (current && current !== owner) return false;
  claims.set(placement, owner);
  return true;
}

export function releasePlacement(placement: AdPlacement, owner: symbol): void {
  if (claims.get(placement) === owner) claims.delete(placement);
}
