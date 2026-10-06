import { useEffect, useState } from "react";
import { isSlotReady, type AdSenseSlotKey } from "@/lib/adsense";
import { useAdsSuppressed } from "@/lib/ad-visibility";
import {
  claimPlacement,
  placementSlotFor,
  releasePlacement,
  type InFlowViewport,
} from "@/lib/ad-placements";
import { isNativeApp } from "@/lib/native/platform";
import { AdSlot, matchesAdViewport } from "./AdSlot";
import { useAdConsentGranted } from "./useAdCmp";
import { useAdPathname } from "./useAdPathname";

interface InFlowAdProps {
  placement: "inFlowTop" | "inFlowBottom";
  className?: string;
}

function currentViewport(): InFlowViewport | null {
  if (matchesAdViewport("mobile")) return "mobile";
  if (matchesAdViewport("wide")) return "wide";
  return null;
}

/**
 * Klar gekennzeichneter Anzeigenplatz im normalen Inhaltsfluss.
 * Rendert nur, wenn Route-Richtlinie, Viewport, echte Slot-ID, Einwilligung,
 * fehlende Unterdrückung und Web (nicht nativ) zusammenpassen. Sonst nichts.
 * Pro Viewport genau eine Einheit; versteckte Viewports werden nie angefragt.
 */
export function InFlowAd({ placement, className }: InFlowAdProps) {
  const suppressed = useAdsSuppressed();
  const consented = useAdConsentGranted();
  const pathname = useAdPathname();
  const [target, setTarget] = useState<{ viewport: InFlowViewport; slot: AdSenseSlotKey } | null>(null);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    if (isNativeApp() || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setTarget(null);
      setClaimed(false);
      return;
    }
    const owner = Symbol(placement);
    setClaimed(claimPlacement(placement, owner));
    const update = () => {
      const viewport = currentViewport();
      const slot = viewport ? placementSlotFor(pathname, placement, viewport) : null;
      setTarget(viewport && slot ? { viewport, slot } : null);
    };
    update();
    const mq = window.matchMedia("(max-width: 767px)");
    mq.addEventListener?.("change", update);
    return () => {
      mq.removeEventListener?.("change", update);
      releasePlacement(placement, owner);
      setClaimed(false);
      setTarget(null);
    };
  }, [placement, pathname]);

  if (suppressed || !consented || !claimed || !target || !isSlotReady(target.slot)) return null;

  const mobile = target.viewport === "mobile";
  return (
    <div
      data-testid={`ad-${placement}`}
      className={className ?? (mobile ? "mx-auto my-8 w-full max-w-[336px] px-4" : "mx-auto my-12 w-full max-w-3xl px-4")}
    >
      <AdSlot
        key={target.slot}
        slot={target.slot}
        viewport={target.viewport}
        minHeight={mobile ? 100 : 250}
        reserve
      />
    </div>
  );
}
