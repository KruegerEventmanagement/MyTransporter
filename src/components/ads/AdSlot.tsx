import { useEffect, useRef, useState } from "react";
import { ADSENSE_CONFIG, getSlotId, isSlotReady, type AdSenseSlotKey } from "@/lib/adsense";
import { useAdsSuppressed } from "@/lib/ad-visibility";
import { areAdRequestsAllowed, pauseAdRequests } from "@/lib/adsense-cmp";
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
 * - Ohne Anzeige (`data-ad-status="unfilled"`) wird die gesamte Fläche inklusive
 *   Kennzeichnung ausgeblendet – beobachtet am echten Attribut von Google,
 *   ohne globale CSS-Regeln, die befüllte Anzeigen treffen könnten.
 */
export function AdSlot({ slot, minHeight = 250, className, label = "Anzeige" }: AdSlotProps) {
  const suppressed = useAdsSuppressed();
  const ready = isSlotReady(slot);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const insRef = useRef<HTMLModElement | null>(null);
  const initialized = useRef(false);
  const [active, setActive] = useState(false);
  const [unfilled, setUnfilled] = useState(false);

  useEffect(() => {
    if (!ready || suppressed) return;
    const el = containerRef.current;
    if (!el || initialized.current) return;

    let cancelled = false;
    const tryInit = async () => {
      if (cancelled || initialized.current) return;
      const width = el.getBoundingClientRect().width;
      if (width <= 0) return; // niemals mit Breite 0 anfragen
      if (!areAdRequestsAllowed()) return; // QA-Modus/unfertige Konfiguration: nie anfragen
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
      // Verlassen der Fläche/Route: Anfragen sofort anhalten.
      pauseAdRequests();
    };
  }, [ready, suppressed]);

  // Echten Füllstatus von Google beobachten und leere Flächen zusammenklappen.
  useEffect(() => {
    const ins = insRef.current;
    if (!active || !ins) return;
    const read = () => setUnfilled(ins.getAttribute("data-ad-status") === "unfilled");
    read();
    const mo = new MutationObserver(read);
    mo.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
    return () => mo.disconnect();
  }, [active]);

  if (!ready || suppressed || !areAdRequestsAllowed()) return null;

  const slotId = getSlotId(slot);
  if (!slotId) return null;

  return (
    <div
      ref={containerRef}
      className={className}
      style={unfilled ? { display: "none" } : undefined}
    >
      {active && !unfilled && (
        <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      )}
      <ins
        ref={insRef}
        className="adsbygoogle block w-full"
        style={{ display: "block", minHeight: active && !unfilled ? minHeight : 0 }}
        data-ad-client={ADSENSE_CONFIG.publisherId}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
