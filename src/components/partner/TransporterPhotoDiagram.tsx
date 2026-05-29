import { useEffect, useState } from "react";
import { Eye, Magnet, CloudRain, RefreshCw } from "lucide-react";
import { VIEWS, type ViewId, type Zone, getViewForZone } from "@/lib/partner-zones";
import { getPartnerPackageOrNull, formatEuro, formatSqm } from "@/lib/partner-packages";
import driverImg from "@/assets/partner/van-driver.jpg";
import passengerImg from "@/assets/partner/van-passenger.jpg";
import rearImg from "@/assets/partner/van-rear.jpg";
import frontImg from "@/assets/partner/van-front.jpg";
import adMockup from "@/assets/partner/ad-mockup.jpg";

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

function ZonePolygon({
  zone,
  selected,
  anySelected,
  clipId,
  viewBoxW,
  viewBoxH,
  onSelect,
}: {
  zone: Zone;
  selected: boolean;
  anySelected: boolean;
  clipId: string;
  viewBoxW: number;
  viewBoxH: number;
  onSelect?: (id: string) => void;
}) {
  const pkg = getPartnerPackageOrNull(zone.code);
  return (
    <g
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(zone.code);
      }}
    >
      {selected && (
        <>
          <defs>
            <clipPath id={clipId}>
              <polygon points={zone.points} />
            </clipPath>
          </defs>
          <image
            href={adMockup}
            x="0"
            y="0"
            width={viewBoxW}
            height={viewBoxH}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
            opacity="0.9"
            style={{ mixBlendMode: "multiply" }}
          />
        </>
      )}
      <polygon
        points={zone.points}
        fill={selected ? "transparent" : "white"}
        fillOpacity={selected ? 0 : 0.14}
        stroke={selected ? "black" : "white"}
        strokeOpacity={selected ? 1 : 0.85}
        strokeWidth={selected ? 4 : 1.5}
        strokeDasharray={selected ? "0" : "8 5"}
        opacity={!selected && anySelected ? 0.45 : 1}
        className="transition-all duration-200 hover:opacity-100"
      />
      <g style={{ pointerEvents: "none" }}>
        <rect
          x={zone.label.x - 26}
          y={zone.label.y - 14}
          width={52}
          height={24}
          rx={5}
          fill={selected ? "black" : "white"}
          fillOpacity={selected ? 1 : 0.85}
        />
        <text
          x={zone.label.x}
          y={zone.label.y + 4}
          textAnchor="middle"
          fontSize={selected ? 16 : 13}
          fontWeight="700"
          fill={selected ? "white" : "black"}
        >
          {zone.code}
        </text>
      </g>
    </g>
  );
}

export function TransporterPhotoDiagram({ highlight, onSelect }: Props) {
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
  const anySelected = !!highlight;
  const [, , vbW, vbH] = current.viewBox.split(" ").map(Number);
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
        <svg
          viewBox={current.viewBox}
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {current.zones.map((z, i) => (
            <ZonePolygon
              key={`${view}-${z.code}-${i}`}
              zone={z}
              selected={highlight === z.code}
              anySelected={anySelected}
              clipId={`clip-${view}-${z.code}-${i}`}
              viewBoxW={vbW}
              viewBoxH={vbH}
              onSelect={onSelect}
            />
          ))}
        </svg>
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
            <div className="text-lg font-bold text-foreground">{formatEuro(activePkg.monthly)}<span className="text-xs text-muted-foreground font-normal"> / Monat</span></div>
            <div className="text-[11px] text-muted-foreground">bei 1 Jahr Laufzeit</div>
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Tippe auf eine Fläche – sie wird mit einem Beispiel-Motiv eingeblendet.
        Größe & Preis werden automatisch aus der gemessenen Fläche berechnet.
      </p>
    </div>
  );
}
