import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { isSlotReady } from "@/lib/adsense";
import { useAdsSuppressed } from "@/lib/ad-visibility";
import { getRouteAdPolicy, type RouteAdPolicy } from "@/lib/ad-placements";
import { AdSlot } from "./AdSlot";
import { useAdCmpBootstrap, useAdConsentGranted } from "./useAdCmp";
import { useAdPathname } from "./useAdPathname";

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
  contentRef?: RefObject<HTMLDivElement | null>;
}

const ASIDE_CLASS = "hidden min-w-0 xl:flex xl:w-[160px] xl:shrink-0 xl:flex-col";
/**
 * Zweiter Platz sitzt am unteren Ende der Spalte (mt-auto, kein Padding).
 * Er wird nur eingehängt, wenn die Inhaltsspalte hoch genug ist
 * (LOWER_RAIL_MIN_CONTENT_PX); damit erzeugt er nie zusätzliche Seitenhöhe,
 * auch nicht, wenn er ungefüllt zusammenklappt.
 */
const LOWER_CLASS = "xl:mt-auto";
export const LOWER_RAIL_MIN_CONTENT_PX = 2000;

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
  contentRef,
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
      <div key={AD_RAILS_CONTENT_KEY} ref={contentRef} data-ad-content="" className={railsActive ? "min-w-0 xl:flex-1" : "contents"}>
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
  const pathname = useAdPathname();
  useAdCmpBootstrap(suppressed, pathname);
  const consented = useAdConsentGranted();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  // Reaktiv aus dem aktuellen Router-Pfad – nie vom vorherigen Pfad.
  const policy = hydrated ? getRouteAdPolicy(pathname) : null;
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [tall, setTall] = useState(false);
  const flags = railFlags(policy, consented);
  // Nur messbar, wenn die Spalten aktiv sind (sonst display: contents = 0 px).
  const baseActive = !suppressed && (flags.left || flags.right);
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !baseActive) {
      setTall(false);
      return;
    }
    const read = () => setTall(el.getBoundingClientRect().height >= LOWER_RAIL_MIN_CONTENT_PX);
    read();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseActive]);
  return buildAdRailsTree({
    suppressed,
    ...flags,
    leftLower: flags.leftLower && tall,
    rightLower: flags.rightLower && tall,
    children,
    contentRef,
  });
}
