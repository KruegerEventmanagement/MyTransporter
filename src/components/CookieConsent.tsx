import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getConsent, setConsent, ensureGoogleTag, hasMarketingConsent } from "@/lib/analytics";
import { ensureMetaPixel } from "@/lib/meta-pixel";
import { captureAttribution } from "@/lib/attribution";

export const OPEN_CONSENT_EVENT = "mt:open-consent";

/** Öffnet die Cookie-Einstellungen erneut (z. B. aus der Datenschutzseite). */
export function openConsentSettings() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_CONSENT_EVENT));
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // First-Touch-Attribution (UTM/gclid/fbclid) immer erfassen – rein lokal,
    // ohne Übertragung an Werbeplattformen.
    captureAttribution();
    const choice = getConsent();
    if (choice === null) setOpen(true);
    // Bei bereits erteilter Einwilligung Tags laden und Consent anwenden.
    if (choice === "marketing" && hasMarketingConsent()) {
      ensureGoogleTag();
      ensureMetaPixel();
      // lädt auch Microsoft UET (Default denied → granted)
      setConsent("marketing");
    }
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  if (!open) return null;

  const choose = (c: "necessary" | "marketing") => {
    setConsent(c);
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie-Einstellungen"
      style={{ marginBottom: "var(--mt-trip-bar, 0px)" }}
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-2xl border border-border bg-card p-5 shadow-xl"
    >
      <h2 className="text-base font-bold text-foreground">Cookies & Einwilligung</h2>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        Technisch notwendige Cookies benötigen wir für Login, Buchung und Zahlung – sie sind immer
        aktiv. Zusätzlich möchten wir Conversion-Tracking von Google Ads, Meta und Microsoft
        Advertising einsetzen, um zu
        messen, welche Anzeigen zu Buchungen führen. Das geschieht nur mit deiner Einwilligung und
        ist jederzeit widerrufbar.
      </p>
      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => choose("necessary")}
          className="flex-1 rounded-full border border-input bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Cookies nicht zulassen
        </button>
        <button
          type="button"
          onClick={() => choose("marketing")}
          className="flex-1 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-transform hover:scale-[1.02]"
        >
          Cookies zulassen
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Mehr dazu in der{" "}
        <Link to="/datenschutz" className="underline hover:text-foreground">
          Datenschutzerklärung
        </Link>
        .
      </p>
    </div>
  );
}
