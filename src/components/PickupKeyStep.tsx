import { useEffect, useState } from "react";
import { ChevronRight, Key } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getPickupKeyCode, type PickupKeyState } from "@/lib/pickup-key.functions";
import { KEY_HANDOVER_HINTS } from "@/lib/key-handover";

/** Abholschritt: echter Schlüsselcode ab 15 Minuten vor Abholung, vorher Hinweis. */
export function PickupKeyStep({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const fetchCode = useServerFn(getPickupKeyCode);
  const [info, setInfo] = useState<PickupKeyState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const r = await fetchCode({ data: { bookingId } });
        if (!alive) return;
        setInfo(r);
        setFailed(false);
        if (r.state === "locked") {
          const wait = Math.max(5_000, Math.min(new Date(r.unlockAt).getTime() - Date.now() + 1_000, 60_000));
          timer = setTimeout(load, wait);
        }
      } catch {
        if (!alive) return;
        setFailed(true);
        timer = setTimeout(load, 15_000);
      }
    };
    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [bookingId, fetchCode]);

  const unlockTime =
    info?.state === "locked"
      ? new Date(info.unlockAt).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })
      : null;

  return (
    <div className="text-center">
      <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
        <Key className="w-10 h-10 text-foreground" />
      </div>
      <h3 className="text-2xl font-bold text-foreground mb-2">Schlüssel abholen</h3>

      <div className="my-8 p-6 rounded-2xl bg-primary text-primary-foreground" aria-live="polite">
        <p className="text-xs opacity-70 mb-2">Dein Schlüsselcode</p>
        {info?.state === "ready" ? (
          <p className="text-4xl font-mono font-bold tracking-[0.3em]">{info.keyCode}</p>
        ) : info?.state === "locked" ? (
          <p className="text-sm">
            Dein Schlüsselcode erscheint hier 15 Minuten vor der Abholung{unlockTime ? ` (ab ${unlockTime} Uhr)` : ""} und kommt
            zusätzlich per E-Mail.
          </p>
        ) : info?.state === "unavailable" ? (
          <p className="text-sm">Code gerade nicht abrufbar. Bitte schau in deine E-Mail oder ruf uns an.</p>
        ) : (
          <p className="text-sm">{failed ? "Keine Verbindung – neuer Versuch läuft …" : "Wird geladen …"}</p>
        )}
      </div>

      <div className="text-left text-sm text-muted-foreground space-y-3 mb-8">
        {KEY_HANDOVER_HINTS.map((h) => (
          <p key={h}>{h}</p>
        ))}
      </div>

      <button
        onClick={onDone}
        disabled={info?.state === "locked"}
        className="w-full rounded-full bg-accent py-4 text-accent-foreground font-medium text-lg transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100"
      >
        Schlüssel erhalten, weiter <ChevronRight className="w-5 h-5 inline" />
      </button>
    </div>
  );
}
