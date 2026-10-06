import { useEffect, useRef, useState } from "react";
import { ADSENSE_CONFIG, getSlotId, isSlotReady, type AdSenseSlotKey } from "@/lib/adsense";
import { useAdsSuppressed } from "@/lib/ad-visibility";
import { areAdRequestsAllowed } from "@/lib/adsense-cmp";
import { adRequestsCurrentlyPermitted, ensureAdSenseScript } from "./adsense-loader";
import { isNativeApp } from "@/lib/native/platform";

/** Seitenspalten erscheinen ausschließlich auf breiten Desktop-Fenstern. */
const WIDE_DESKTOP_QUERY = "(min-width: 1280px)";
/** Mobiler Banner nur auf echten Handybreiten. */
const MOBILE_QUERY = "(max-width: 767px)";

export type AdViewport = "desktop" | "mobile";

export function matchesAdViewport(viewport: AdViewport): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false; // fail-closed
  return window.matchMedia(viewport === "mobile" ? MOBILE_QUERY : WIDE_DESKTOP_QUERY).matches;
}

interface AdSlotProps {
  slot: AdSenseSlotKey;
  /** Mindesthöhe der reservierten Fläche, sobald aktiv (kein Layout-Sprung). */
  minHeight?: number;
  className?: string;
  label?: string;
  /** Viewport, für den die Fläche gedacht ist; außerhalb davon keine Anfrage. */
  viewport?: AdViewport;
  /** Reserviert minHeight bereits vor der Befüllung (gegen Layout-Sprünge). */
  reserve?: boolean;
}

/**
 * Eine einzelne Werbefläche.
 *
 * - Rendert NICHTS (kein Platzhalter, kein leeres Rechteck), solange AdSense
 *   nicht vollständig konfiguriert, freigegeben und einwilligungsbereit ist.
 * - Lädt das Script einmalig asynchron und initialisiert JEDES echte
 *   `<ins>`-Element genau einmal (kein doppeltes `push`).
 * - Lazy: Initialisierung erst, wenn die Fläche in den Viewport kommt, eine
 *   echte Breite > 0 hat und das Fenster ein breiter Desktop ist – auf
 *   Mobil/Tablet entsteht damit keine einzige Anfrage.
 * - Ohne Anzeige (`data-ad-status="unfilled"`) wird die gesamte Fläche inklusive
 *   Kennzeichnung ausgeblendet – beobachtet am echten Attribut von Google,
 *   ohne globale CSS-Regeln, die befüllte Anzeigen treffen könnten.
 * - Das Aufräumen einer einzelnen Fläche pausiert NICHT global die Anfragen
 *   anderer, weiterhin berechtigter Flächen; das Pausieren übernimmt der
 *   CMP-/Suppression-Lebenszyklus (useAdCmp).
 */
export function AdSlot({
  slot,
  minHeight = 250,
  className,
  label = "Anzeige",
  viewport = "desktop",
  reserve = false,
}: AdSlotProps) {
  const suppressed = useAdsSuppressed();
  const ready = isSlotReady(slot);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const insRef = useRef<HTMLModElement | null>(null);
  /** Merkt sich das konkrete `<ins>`, für das bereits angefragt wurde. */
  const initializedIns = useRef<HTMLModElement | null>(null);
  const [active, setActive] = useState(false);
  const [unfilled, setUnfilled] = useState(false);

  useEffect(() => {
    if (!ready || suppressed || isNativeApp()) return;
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    const tryInit = async () => {
      if (cancelled) return;
      const ins = insRef.current;
      if (!ins || initializedIns.current === ins) return; // pro echtem <ins> nur einmal
      if (!matchesAdViewport(viewport)) return; // keine Anfragen für ausgeblendete Viewports
      const width = el.getBoundingClientRect().width;
      if (width <= 0) return; // niemals mit Breite 0 anfragen
      if (!areAdRequestsAllowed()) return; // QA-Modus/unfertige Konfiguration: nie anfragen
      const loaded = await ensureAdSenseScript(ADSENSE_CONFIG, { suppressed: false });
      if (cancelled || !loaded) return;
      // Nach dem await: aktuelle Berechtigung und identisches <ins> erneut prüfen.
      if (insRef.current !== ins || initializedIns.current === ins) return;
      if (!adRequestsCurrentlyPermitted()) return;
      initializedIns.current = ins;
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
      // Kein globales Pausieren hier: andere berechtigte Flächen bleiben aktiv.
    };
  }, [ready, suppressed, viewport]);

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

  if (!ready || suppressed || isNativeApp() || !areAdRequestsAllowed()) return null;

  const slotId = getSlotId(slot);
  if (!slotId) return null;

  return (
    <div
      ref={containerRef}
      className={className}
      style={unfilled ? { display: "none" } : reserve ? { minHeight: minHeight + 16 } : undefined}
    >
      {(active || reserve) && !unfilled && (
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
