import { useEffect, useState } from "react";
import { Eye, Magnet, CloudRain, RefreshCw } from "lucide-react";
import type { PartnerPackageId } from "@/lib/partner-packages";
import { VIEWS, type ViewId, type Zone } from "@/lib/partner-zones";
import driverImg from "@/assets/partner/transporter-driver.jpg";
import passengerImg from "@/assets/partner/transporter-passenger.jpg";
import rearImg from "@/assets/partner/transporter-rear.jpg";
import frontImg from "@/assets/partner/transporter-front.jpg";
import adMockup from "@/assets/partner/ad-mockup.jpg";

interface Props {
  highlight?: PartnerPackageId | null;
  onSelect?: (id: PartnerPackageId) => void;
}

const IMAGES: Record<ViewId, string> = {
  driver: driverImg,
  passenger: passengerImg,
  rear: rearImg,
  front: frontImg,
};

/** Welche Ansicht enthält welches Paket (für Auto-Switch bei Klick auf Card). */
function viewForPackage(pkg: PartnerPackageId | null | undefined): ViewId {
  if (!pkg) return "driver";
  const order: ViewId[] = ["driver", "passenger", "rear", "front"];
  for (const v of order) {
    if (VIEWS[v].zones.some((z) => z.pkg === pkg)) return v;
  }
  return "driver";
}

function ZonePolygon({
  zone,
  selected,
  anySelected,
  clipId,
  onSelect,
}: {
  zone: Zone;
  selected: boolean;
  anySelected: boolean;
  clipId: string;
  onSelect?: (id: PartnerPackageId) => void;
}) {
  return (
    <g
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(zone.pkg);
      }}
    >
      {/* Werbe-Mockup nur im ausgewählten Zustand */}
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
            width="1600"
            height="800"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
            opacity="0.92"
            style={{ mixBlendMode: "multiply" }}
          />
        </>
      )}

      {/* Fläche */}
      <polygon
        points={zone.points}
        fill={selected ? "transparent" : "white"}
        fillOpacity={selected ? 0 : 0.18}
        stroke={selected ? "black" : "white"}
        strokeOpacity={selected ? 1 : 0.85}
        strokeWidth={selected ? 4 : 1.5}
        strokeDasharray={selected ? "0" : "10 6"}
        opacity={!selected && anySelected ? 0.55 : 1}
        className="transition-all duration-200 hover:opacity-100"
      />

      {/* Label */}
      <g style={{ pointerEvents: "none" }}>
        <rect
          x={zone.label.x - 28}
          y={zone.label.y - 16}
          width={56}
          height={28}
          rx={6}
          fill={selected ? "black" : "white"}
          fillOpacity={selected ? 1 : 0.85}
        />
        <text
          x={zone.label.x}
          y={zone.label.y + 4}
          textAnchor="middle"
          fontSize={selected ? 18 : 14}
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
  const [view, setView] = useState<ViewId>(() => viewForPackage(highlight));

  // Bei Auswahl von außen automatisch auf passende Ansicht wechseln
  useEffect(() => {
    if (!highlight) return;
    const inCurrent = VIEWS[view].zones.some((z) => z.pkg === highlight);
    if (!inCurrent) setView(viewForPackage(highlight));
  }, [highlight]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = VIEWS[view];
  const anySelected = !!highlight;

  return (
    <div className="w-full text-foreground">
      {/* Feature-Icons */}
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

      {/* Tab-Leiste */}
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
            {VIEWS[v].label}
          </button>
        ))}
      </div>

      {/* Foto + Overlay */}
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
              selected={highlight === z.pkg}
              anySelected={anySelected}
              clipId={`clip-${view}-${z.code}-${i}`}
              onSelect={onSelect}
            />
          ))}
        </svg>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Tippe auf eine Fläche, um sie auszuwählen. Ausgewählte Fläche zeigt ein
        Beispiel-Werbemotiv – so sieht's beklebt aus. Magnetfolie 0,9 mm, wetterfest,
        jederzeit austauschbar.
      </p>
    </div>
  );
}