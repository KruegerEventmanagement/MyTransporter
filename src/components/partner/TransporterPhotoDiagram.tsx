import { useEffect, useState } from "react";
import { Eye, Magnet, CloudRain, RefreshCw } from "lucide-react";
import { VIEWS, type ViewId, getViewForZone } from "@/lib/partner-zones";
import { getPartnerPackageOrNull, formatEuro, formatSqm } from "@/lib/partner-packages";
import driverImg from "@/assets/partner/van-driver.jpg";
import passengerImg from "@/assets/partner/van-passenger.jpg";
import rearImg from "@/assets/partner/van-rear.jpg";
import frontImg from "@/assets/partner/van-front.jpg";
interface Props {
  highlight?: string | null;
  onSelect?: (id: string) => void;
}

const IMAGES: Record<ViewId, string> = {
  driver: driverImg,
  passenger: passengerImg,
  rear: rearImg,
  front: frontImg,
};

export function TransporterPhotoDiagram({ highlight }: Props) {
  const [view, setView] = useState<ViewId>(() =>
    highlight ? getViewForZone(highlight) : "driver",
  );

  useEffect(() => {
    if (!highlight) return;
    const v = getViewForZone(highlight);
    if (v !== view) setView(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight]);

  const current = VIEWS[view];
  const activePkg = highlight ? getPartnerPackageOrNull(highlight) : null;

  return (
    <div className="w-full text-foreground">
      <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mb-6 text-muted-foreground">
        {[
          { icon: Eye, label: "Hohe Sichtbarkeit" },
          { icon: Magnet, label: "Magnetisch & flexibel" },
          { icon: CloudRain, label: "Wetterfest & robust" },
          { icon: RefreshCw, label: "Austauschbar & nachhaltig" },
        ].map((f) => (
          <div key={f.label} className="flex flex-col items-center gap-1 text-[10px] sm:text-xs">
            <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center">
              <f.icon className="w-3.5 h-3.5" />
            </div>
            <span>{f.label}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-2 mb-4 overflow-x-auto">
        {(Object.keys(VIEWS) as ViewId[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
              view === v
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-foreground border-border hover:border-foreground/40"
            }`}
          >
            {VIEWS[v].label} ({VIEWS[v].zones.length})
          </button>
        ))}
      </div>

      <div
        className="relative w-full rounded-2xl overflow-hidden border border-border bg-secondary"
        style={{ aspectRatio: current.aspect }}
      >
        <img
          src={IMAGES[view]}
          alt={`Transporter ${current.label} mit Werbeflächen`}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-contain"
        />
      </div>

      {activePkg && (
        <div className="mt-4 p-4 rounded-xl bg-card border border-border flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{activePkg.viewLabel} · Fläche {activePkg.code}</div>
            <div className="text-sm font-semibold text-foreground">
              {activePkg.sizeLabel} · {formatSqm(activePkg.sqm)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-foreground">
              {formatEuro(activePkg.monthly)}<span className="text-xs text-muted-foreground font-normal"> netto / Monat</span>
            </div>
            <div className="text-[11px] text-muted-foreground">Preis bei 1 Jahr Laufzeit</div>
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Wähle weiter unten eine Fläche aus, Größe & Preis werden automatisch aus der
        gemessenen Fläche berechnet.
      </p>
    </div>
  );
}
