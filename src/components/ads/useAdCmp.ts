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
import { subscribeAdConsent } from "@/lib/adsense-consent";
import {
  areAdRequestsAllowed,
  bootstrapAdConsentCmp,
  isCmpApiReady,
  lastAdConsentEvaluation,
  pauseAdRequests,
  teardownAdConsentCmp,
} from "@/lib/adsense-cmp";

export function useAdCmpBootstrap(suppressed: boolean): void {
  useEffect(() => {
    if (suppressed) {
      // Unterdrückung: sofort pausieren und Listener/Timer abbauen, damit
      // veraltete Callbacks nichts mehr freigeben können.
      teardownAdConsentCmp();
      return;
    }
    bootstrapAdConsentCmp({ pathname: window.location.pathname, suppressed: false });
    return () => {
      // Route-/Unterdrückungswechsel: Anfragen anhalten und abbauen.
      pauseAdRequests();
      teardownAdConsentCmp();
    };
  }, [suppressed]);
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
