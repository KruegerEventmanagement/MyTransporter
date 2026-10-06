/**
 * Sichtbarkeit der internen Eigenwerbung ("Hier werben") auf der Startseite.
 * Getrennt von ad-visibility (AdSense-Unterdrückung ab Schritt 3), weil die
 * Eigenwerbung bereits ab Beginn des Buchungswizards verschwinden soll.
 * Reines UI-Signal; der Wizard bleibt gemountet, kein Stateverlust.
 */
import { useEffect, useState } from "react";

let hidden = false;
const listeners = new Set<(v: boolean) => void>();

export function setHouseAdHidden(value: boolean): void {
  if (hidden === value) return;
  hidden = value;
  listeners.forEach((l) => l(hidden));
}

export function useHouseAdHidden(): boolean {
  const [v, setV] = useState(hidden);
  useEffect(() => {
    setV(hidden);
    listeners.add(setV);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

export function useHideHouseAd(active: boolean): void {
  useEffect(() => {
    setHouseAdHidden(active);
    return () => setHouseAdHidden(false);
  }, [active]);
}
