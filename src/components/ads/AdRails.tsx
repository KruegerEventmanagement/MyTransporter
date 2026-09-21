import type { ReactNode } from "react";
import { isSlotReady } from "@/lib/adsense";
import { useAdsSuppressed } from "@/lib/ad-visibility";
import { AdSlot } from "./AdSlot";

interface AdRailsProps {
  children: ReactNode;
}

/**
 * Responsives Layout mit reservierten Werbespalten links und rechts.
 *
 * - Inaktiv (nicht konfiguriert / keine Einwilligung / transaktionaler Schritt):
 *   die Kinder werden unverändert gerendert, das Layout bleibt exakt wie bisher.
 * - Aktiv: ab xl eigene Außenspalten, die den Inhalt nicht überlagern und die
 *   Inhaltsbreite nicht verkleinern. Auf Handy/Tablet gibt es keine Sidebars.
 */
export function AdRails({ children }: AdRailsProps) {
  const suppressed = useAdsSuppressed();
  const left = isSlotReady("railLeft");
  const right = isSlotReady("railRight");

  if (suppressed || (!left && !right)) return <>{children}</>;

  return (
    <div className="xl:flex xl:items-start xl:justify-center xl:gap-6">
      {left && (
        <aside
          aria-label="Anzeige"
          className="hidden xl:block xl:w-[160px] xl:shrink-0 xl:sticky xl:top-20"
        >
          <AdSlot slot="railLeft" minHeight={600} />
        </aside>
      )}
      <div className="min-w-0 xl:flex-1">{children}</div>
      {right && (
        <aside
          aria-label="Anzeige"
          className="hidden xl:block xl:w-[160px] xl:shrink-0 xl:sticky xl:top-20"
        >
          <AdSlot slot="railRight" minHeight={600} />
        </aside>
      )}
    </div>
  );
}
