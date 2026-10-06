import { Link } from "@tanstack/react-router";
import { useAdsSuppressed } from "@/lib/ad-visibility";
import { useHouseAdHidden } from "@/lib/house-ad-visibility";
import { isNativeApp } from "@/lib/native/platform";
import { useEffect, useState } from "react";

/**
 * Dezente, als Eigenwerbung gekennzeichnete interne Verlinkung zur
 * Direktanfrage eines Desktop-Werbeplatzes. Keine externen Abrufe,
 * kein leerer Anzeigenkasten. Verschwindet ab Beginn des Buchungswizards.
 */
export function HouseAdCta() {
  const hidden = useHouseAdHidden();
  const suppressed = useAdsSuppressed();
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  if (hidden || suppressed || native) return null;
  return (
    <div data-testid="house-ad-cta" className="mx-auto mb-3 flex max-w-md justify-center px-2">
      <Link
        to="/werbung"
        hash="online-werbung"
        className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
      >
        <span className="font-semibold uppercase tracking-wide text-[10px]">Eigenwerbung</span>
        <span>Hier werben: 29 € netto / 30 Tage · Desktop-Werbeplatz</span>
      </Link>
    </div>
  );
}
