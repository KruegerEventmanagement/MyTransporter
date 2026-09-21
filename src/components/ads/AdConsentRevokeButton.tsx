import { showAdConsentRevocationMessage } from "@/lib/adsense-cmp";
import { useAdCmpApiReady } from "./useAdCmp";
import { resetAdSenseScriptLoad } from "./adsense-loader";

/**
 * Widerrufs-/Einstellungslink für die Google-Einwilligungsmeldung.
 *
 * Erscheint ausschließlich, wenn die Einwilligungs-API tatsächlich bereit ist.
 * Beim Klick werden zuerst Anzeigenanfragen angehalten und vorhandene Anzeigen
 * entfernt, danach öffnet die offizielle Widerrufs-Meldung.
 */
export function AdConsentRevokeButton({ className }: { className?: string }) {
  const ready = useAdCmpApiReady();
  if (!ready) return null;
  return (
    <button
      type="button"
      className={className ?? "hover:text-foreground transition-colors underline-offset-4 hover:underline"}
      onClick={() => {
        resetAdSenseScriptLoad();
        showAdConsentRevocationMessage();
      }}
    >
      Datenschutz für Werbung
    </button>
  );
}
