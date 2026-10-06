/**
 * React-Anbindung an die echte Google-Einwilligungsmeldung.
 *
 * - `useAdCmpBootstrap` startet die Meldung einmalig auf erlaubten öffentlichen
 *   Seiten und hält Anzeigenanfragen beim Verlassen/Unterdrücken sofort an.
 * - `useAdConsentGranted` liefert reaktiv, ob eine geprüfte Einwilligung
 *   vorliegt, damit Werbespalten ohne Seiten-Remount ein-/ausgeblendet werden.
 * - `useAdCmpApiReady` steuert die Sichtbarkeit des Widerrufs-Buttons.
 */

import { useEffect, useState } from "react";
import { getRouteAdPolicy } from "@/lib/ad-placements";
import { isNativeApp } from "@/lib/native/platform";
import { subscribeAdConsent } from "@/lib/adsense-consent";
import { resetAdSenseScriptLoad } from "@/components/ads/adsense-loader";
import {
  areAdRequestsAllowed,
  bootstrapAdConsentCmp,
  isCmpApiReady,
  lastAdConsentEvaluation,
  pauseAdRequests,
  teardownAdConsentCmp,
} from "@/lib/adsense-cmp";

export function useAdCmpBootstrap(suppressed: boolean, pathname?: string): void {
  const path = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  const allowed = getRouteAdPolicy(path) !== null;
  useEffect(() => {
    // Native App-Screens und nicht erlaubte Pfade laden nie AdSense/CMP-Scripts.
    if (suppressed || isNativeApp() || !allowed) {
      // Unterdrückung: sofort pausieren und Listener/Timer abbauen, damit
      // veraltete Callbacks nichts mehr freigeben können.
      teardownAdConsentCmp();
      resetAdSenseScriptLoad();
      return;
    }
    bootstrapAdConsentCmp({ pathname: path, suppressed: false });
    return () => {
      // Route-/Unterdrückungswechsel: Anfragen anhalten und abbauen.
      pauseAdRequests();
      teardownAdConsentCmp();
      resetAdSenseScriptLoad();
    };
    // Neuer Pfad (auch zwischen zwei erlaubten Seiten) = neuer Lebenszyklus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppressed, allowed, path]);
}

export function useAdConsentGranted(): boolean {
  const [granted, setGranted] = useState(false);
  useEffect(() => {
    if (!areAdRequestsAllowed()) {
      setGranted(false);
      return;
    }
    setGranted(lastAdConsentEvaluation().consented);
    return subscribeAdConsent((consented) => setGranted(consented && areAdRequestsAllowed()));
  }, []);
  return granted;
}

export function useAdCmpApiReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (!cancelled) setReady(isCmpApiReady());
    };
    check();
    const timer = setInterval(check, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return ready;
}
