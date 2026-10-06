import { useEffect, useState } from "react";
import { isSlotReady } from "@/lib/adsense";
import { useAdsSuppressed } from "@/lib/ad-visibility";
import { isNativeApp } from "@/lib/native/platform";
import { AdSlot, matchesAdViewport } from "./AdSlot";
import { useAdConsentGranted } from "./useAdCmp";

/** Reservierte Höhe des mobilen Banners (320×100) – verhindert Layout-Sprünge. */
export const MOBILE_TOP_AD_HEIGHT = 100;

/**
 * Mobiler, klar gekennzeichneter Anzeigenbereich oberhalb des großen Logos.
 *
 * Rendert nur, wenn AdSense vollständig konfiguriert ist (inkl. echter
 * mobileTop-Slot-ID), eine geprüfte Einwilligung vorliegt, keine
 * transaktionale Unterdrückung aktiv ist, das Fenster wirklich Handybreite hat
 * und es keine native App ist. Sonst: nichts (kein leerer Platzhalter).
 * Liegt im normalen Dokumentfluss – überlagert nie Navigation oder Bedienelemente.
 */
export function MobileTopAd() {
  const suppressed = useAdsSuppressed();
  const consented = useAdConsentGranted();
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    if (isNativeApp() || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setEligible(false);
      return;
    }
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setEligible(matchesAdViewport("mobile"));
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  if (suppressed || !consented || !eligible || !isSlotReady("mobileTop")) return null;

  return (
    <div data-testid="mobile-top-ad" className="mx-auto w-full max-w-[336px] px-4 pt-2 md:hidden">
      <AdSlot slot="mobileTop" viewport="mobile" minHeight={MOBILE_TOP_AD_HEIGHT} reserve />
    </div>
  );
}
