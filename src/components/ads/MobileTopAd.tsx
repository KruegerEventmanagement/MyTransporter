import { InFlowAd } from "./InFlowAd";

/** Reservierte Höhe des mobilen Banners (320×100) – verhindert Layout-Sprünge. */
export const MOBILE_TOP_AD_HEIGHT = 100;

/**
 * Oberer In-Flow-Platz der Startseite oberhalb des großen Logos.
 * Auf Handys nutzt er die echte mobileTop-Einheit, ab 768 px die Inline-Einheit
 * (nur falls hinterlegt). Liegt im Dokumentfluss, überlagert nie Navigation.
 */
export function MobileTopAd() {
  return <InFlowAd placement="inFlowTop" className="mx-auto w-full max-w-[336px] px-4 pt-2 md:max-w-3xl" />;
}
