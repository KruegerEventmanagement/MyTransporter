import { useEffect, useState, type ReactNode } from "react";
import { isSlotReady } from "@/lib/adsense";
import { useAdsSuppressed } from "@/lib/ad-visibility";
import { getRouteAdPolicy, type RouteAdPolicy } from "@/lib/ad-placements";
import { AdSlot } from "./AdSlot";
import { useAdCmpBootstrap, useAdConsentGranted } from "./useAdCmp";

interface AdRailsProps {
  children: ReactNode;
}

/** Stabiler Slot-Key für die Inhaltsspalte – darf sich nie ändern. */
export const AD_RAILS_CONTENT_KEY = "ad-rails-content";

interface AdRailsTreeArgs {
  suppressed: boolean;
  left: boolean;
  right: boolean;
  /** Zweite, tiefer liegende Rail-Einheit (nur lange Seiten). */
  leftLower?: boolean;
  rightLower?: boolean;
  children: ReactNode;
}

const ASIDE_CLASS = "hidden min-w-0 xl:flex xl:w-[160px] xl:shrink-0 xl:flex-col";
/** Großer Abstand: der zweite Platz liegt weit unten neben weiterem Inhalt. */
const LOWER_CLASS = "xl:mt-auto xl:pt-[60vh]";

/**
 * Baut die Layoutstruktur der Werbespalten.
 *
 * WICHTIG: Die DOM-Vorfahren der Kinder sind IMMER identisch (äußeres div →
 * Inhalts-div mit stabilem Key), unabhängig von Unterdrückung, Konfiguration
 * oder Einwilligung. Nur Klassen wechseln (inaktiv: `display: contents`) und
 * die Spalten daneben werden ein-/ausgehängt. Kein Remount des Inhalts.
 * Rails sind NICHT sticky; sie scrollen im Seitenfluss mit.
 */
export function buildAdRailsTree({
  suppressed,
  left,
  right,
  leftLower = false,
  rightLower = false,
  children,
}: AdRailsTreeArgs) {
  const showLeft = !suppressed && (left || leftLower);
  const showRight = !suppressed && (right || rightLower);
  const railsActive = showLeft || showRight;

  return (
    <div
      key="ad-rails-root"
      className={railsActive ? "xl:flex xl:items-stretch xl:justify-center xl:gap-6" : "contents"}
    >
      {showLeft ? (
        <aside key="ad-rails-left" aria-label="Anzeige" className={ASIDE_CLASS}>
          {left ? <AdSlot slot="railLeft" minHeight={600} /> : null}
          {leftLower ? (
            <div key="ad-rails-left-lower" className={LOWER_CLASS}>
              <AdSlot slot="railLeftLower" minHeight={600} />
            </div>
          ) : null}
        </aside>
      ) : null}
      <div key={AD_RAILS_CONTENT_KEY} className={railsActive ? "min-w-0 xl:flex-1" : "contents"}>
        {children}
      </div>
      {showRight ? (
        <aside key="ad-rails-right" aria-label="Anzeige" className={ASIDE_CLASS}>
          {right ? <AdSlot slot="railRight" minHeight={600} /> : null}
          {rightLower ? (
            <div key="ad-rails-right-lower" className={LOWER_CLASS}>
              <AdSlot slot="railRightLower" minHeight={600} />
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}

/** Rail-Freigaben aus Route-Richtlinie + Einwilligung + echter Slot-ID. */
export function railFlags(policy: RouteAdPolicy | null, consented: boolean) {
  const n = policy?.railsPerSide ?? 0;
  return {
    left: consented && n >= 1 && isSlotReady("railLeft"),
    right: consented && n >= 1 && isSlotReady("railRight"),
    leftLower: consented && n >= 2 && isSlotReady("railLeftLower"),
    rightLower: consented && n >= 2 && isSlotReady("railRightLower"),
  };
}

/**
 * Werbespalten links/rechts gemäß zentraler Route-Richtlinie (ad-placements.ts).
 * Awin-Partnerangebote erscheinen hier nie (nur /werbeflaeche).
 * Startet die Einwilligungsmeldung nur auf erlaubten Seiten; Unterdrückung
 * oder Verlassen der Seite pausiert Anfragen sofort, ohne Inhalt neu zu mounten.
 */
export function AdRails({ children }: AdRailsProps) {
  const suppressed = useAdsSuppressed();
  useAdCmpBootstrap(suppressed);
  const consented = useAdConsentGranted();
  const [policy, setPolicy] = useState<RouteAdPolicy | null>(null);
  useEffect(() => setPolicy(getRouteAdPolicy(window.location.pathname)), []);
  return buildAdRailsTree({ suppressed, ...railFlags(policy, consented), children });
}
