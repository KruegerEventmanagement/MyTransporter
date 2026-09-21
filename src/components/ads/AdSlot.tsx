import { useEffect, useRef, useState } from "react";
import { ADSENSE_CONFIG, getSlotId, isSlotReady, type AdSenseSlotKey } from "@/lib/adsense";
import { useAdsSuppressed } from "@/lib/ad-visibility";
import { ensureAdSenseScript } from "./adsense-loader";

interface AdSlotProps {
  slot: AdSenseSlotKey;
  /** Mindesthöhe der reservierten Fläche, sobald aktiv (kein Layout-Sprung). */
  minHeight?: number;
  className?: string;
  label?: string;
}

/**
 * Eine einzelne Werbefläche.
 *
 * - Rendert NICHTS (kein Platzhalter, kein leeres Rechteck), solange AdSense
 *   nicht vollständig konfiguriert, freigegeben und einwilligungsbereit ist.
 * - Lädt das Script einmalig asynchron und initialisiert den Slot genau einmal.
 * - Lazy: Initialisierung erst, wenn die Fläche in den Viewport kommt und eine
 *   echte Breite > 0 hat (keine Zero-Width-Requests).
 * - Unbefüllte Flächen werden zusammengeklappt.
 */
export function AdSlot({ slot, minHeight = 250, className, label = "Anzeige" }: AdSlotProps) {
  const suppressed = useAdsSuppressed();
  const ready = isSlotReady(slot);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initialized = useRef(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!ready || suppressed) return;
    const el = containerRef.current;
    if (!el || initialized.current) return;

    let cancelled = false;
    const tryInit = async () => {
      if (cancelled || initialized.current) return;
      const width = el.getBoundingClientRect().width;
      if (width <= 0) return; // niemals mit Breite 0 anfragen
      const loaded = await ensureAdSenseScript();
      if (cancelled || !loaded || initialized.current) return;
      initialized.current = true;
      setActive(true);
      try {
        const w = window as unknown as { adsbygoogle?: unknown[] };
        w.adsbygoogle = w.adsbygoogle || [];
        w.adsbygoogle.push({});
      } catch {
        /* ignorieren – Anzeige bleibt einfach leer */
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void tryInit();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [ready, suppressed]);

  if (!ready || suppressed) return null;

  const slotId = getSlotId(slot);
  if (!slotId) return null;

  return (
    <div ref={containerRef} className={className}>
      {active && (
        <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      )}
      <ins
        className="adsbygoogle block w-full"
        style={{ display: "block", minHeight: active ? minHeight : 0 }}
        data-ad-client={ADSENSE_CONFIG.publisherId}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
        /* Unbefüllte Flächen zusammenklappen */
        data-ad-status-collapse="true"
      />
    </div>
  );
}
