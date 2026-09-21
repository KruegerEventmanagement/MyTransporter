import type { ReactNode } from "react";
import { isSlotReady } from "@/lib/adsense";
import { useAdsSuppressed } from "@/lib/ad-visibility";
import { AdSlot } from "./AdSlot";

interface AdRailsProps {
  children: ReactNode;
}

/** Stabiler Slot-Key für die Inhaltsspalte – darf sich nie ändern. */
export const AD_RAILS_CONTENT_KEY = "ad-rails-content";

interface AdRailsTreeArgs {
  suppressed: boolean;
  left: boolean;
  right: boolean;
  children: ReactNode;
}

/**
 * Baut die Layoutstruktur der Werbespalten.
 *
 * WICHTIG: Die DOM-Vorfahren der Kinder sind IMMER identisch (äußeres div →
 * Inhalts-div mit stabilem Key), unabhängig von Unterdrückung, Konfiguration
 * oder Einwilligung. Nur die CSS-Klassen wechseln (inaktiv: `display: contents`,
 * d. h. kein zusätzlicher Layout-Container) und die Werbespalten daneben werden
 * ein- oder ausgehängt. So wird der Inhalt (z. B. der Buchungsablauf) niemals
 * neu gemountet und verliert keinen Zustand.
 */
export function buildAdRailsTree({ suppressed, left, right, children }: AdRailsTreeArgs) {
  const railsActive = !suppressed && (left || right);
  const asideClass = "hidden xl:block xl:w-[160px] xl:shrink-0 xl:sticky xl:top-20";

  return (
    <div
      key="ad-rails-root"
      className={railsActive ? "xl:flex xl:items-start xl:justify-center xl:gap-6" : "contents"}
    >
      {railsActive && left ? (
        <aside key="ad-rails-left" aria-label="Anzeige" className={asideClass}>
          <AdSlot slot="railLeft" minHeight={600} />
        </aside>
      ) : null}
      <div
        key={AD_RAILS_CONTENT_KEY}
        className={railsActive ? "min-w-0 xl:flex-1" : "contents"}
      >
        {children}
      </div>
      {railsActive && right ? (
        <aside key="ad-rails-right" aria-label="Anzeige" className={asideClass}>
          <AdSlot slot="railRight" minHeight={600} />
        </aside>
      ) : null}
    </div>
  );
}

/**
 * Responsives Layout mit reservierten Werbespalten links und rechts.
 *
 * - Inaktiv (nicht konfiguriert / keine Einwilligung / transaktionaler Schritt):
 *   keine Werbespalten, Inhalt erscheint per `display: contents` layoutgleich.
 * - Aktiv: ab xl eigene Außenspalten, die den Inhalt nicht überlagern.
 *   Auf Handy/Tablet gibt es keine Sidebars.
 */
export function AdRails({ children }: AdRailsProps) {
  const suppressed = useAdsSuppressed();
  // Einwilligungsmeldung starten (nur erlaubte öffentliche Seiten, niemals
  // während transaktionaler Schritte) und reaktiv auf Consent-Änderungen
  // reagieren, ohne den Inhalt neu zu mounten.
  useAdCmpBootstrap(suppressed);
  const consented = useAdConsentGranted();
  return buildAdRailsTree({
    suppressed,
    left: consented && isSlotReady("railLeft"),
    right: consented && isSlotReady("railRight"),
    children,
  });
}
