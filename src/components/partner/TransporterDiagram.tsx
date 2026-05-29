import { useState, type ReactNode } from "react";
import { Eye, Magnet, CloudRain, RefreshCw } from "lucide-react";
import type { PartnerPackageId } from "@/lib/partner-packages";

/**
 * Werbeflächen-Diagramm im Stil der Referenz-Infografik.
 * 4 Ansichten: Fahrerseite, Beifahrerseite, Heck, Front.
 * Jede Fläche ist klickbar und meldet das zugehörige Paket zurück.
 */

interface Area {
  id: PartnerPackageId;
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  highlight?: PartnerPackageId | null;
  onSelect?: (id: PartnerPackageId) => void;
}

// Style-Tokens je Paket (monochrom: nur Graustufen, unterschiedliche Strich-Stile)
const STYLES: Record<
  PartnerPackageId,
  { stroke: string; dash: string; fill: string; weight: number }
> = {
  hauptsponsor: { stroke: "currentColor", dash: "0", fill: "currentColor", weight: 2 },
  leschi: { stroke: "currentColor", dash: "5 3", fill: "currentColor", weight: 1.75 },
  heck_goldplatz: { stroke: "currentColor", dash: "1 3", fill: "currentColor", weight: 1.75 },
  city_spot: { stroke: "currentColor", dash: "4 3", fill: "currentColor", weight: 1.25 },
  mini_spot: { stroke: "currentColor", dash: "2 2", fill: "currentColor", weight: 1 },
};

const FILL_OPACITY: Record<PartnerPackageId, number> = {
  hauptsponsor: 0.18,
  leschi: 0.12,
  heck_goldplatz: 0.12,
  city_spot: 0.06,
  mini_spot: 0.06,
};

// === Flächen ===

// Fahrerseite (links) — viewBox 0 0 640 260
const LEFT: Area[] = [
  { id: "city_spot", code: "C1", x: 235, y: 38, w: 26, h: 18 },
  { id: "hauptsponsor", code: "HS1", x: 175, y: 78, w: 175, h: 90 },
  { id: "leschi", code: "L1", x: 360, y: 80, w: 130, h: 88 },
  { id: "city_spot", code: "C2", x: 138, y: 176, w: 38, h: 26 },
  { id: "city_spot", code: "C3", x: 183, y: 176, w: 60, h: 26 },
  { id: "city_spot", code: "C4", x: 250, y: 176, w: 60, h: 26 },
  { id: "city_spot", code: "C5", x: 317, y: 176, w: 60, h: 26 },
  { id: "city_spot", code: "C6", x: 384, y: 176, w: 60, h: 26 },
  { id: "mini_spot", code: "M2", x: 450, y: 176, w: 30, h: 26 },
  { id: "mini_spot", code: "M1", x: 138, y: 208, w: 30, h: 20 },
  { id: "mini_spot", code: "M3", x: 215, y: 230, w: 32, h: 16 },
  { id: "mini_spot", code: "M4", x: 285, y: 230, w: 32, h: 16 },
  { id: "mini_spot", code: "M5", x: 355, y: 230, w: 32, h: 16 },
];

// Beifahrerseite (rechts) — gespiegelt
const RIGHT: Area[] = [
  { id: "city_spot", code: "C7", x: 379, y: 38, w: 26, h: 18 },
  { id: "leschi", code: "L2", x: 150, y: 80, w: 130, h: 88 },
  { id: "hauptsponsor", code: "HS2", x: 290, y: 78, w: 175, h: 90 },
  { id: "city_spot", code: "C4", x: 196, y: 176, w: 60, h: 26 },
  { id: "city_spot", code: "C5", x: 263, y: 176, w: 60, h: 26 },
  { id: "city_spot", code: "C6", x: 330, y: 176, w: 60, h: 26 },
  { id: "city_spot", code: "C3", x: 397, y: 176, w: 60, h: 26 },
  { id: "city_spot", code: "C8", x: 464, y: 176, w: 38, h: 26 },
  { id: "mini_spot", code: "M6", x: 472, y: 208, w: 30, h: 20 },
  { id: "mini_spot", code: "M7", x: 253, y: 230, w: 32, h: 16 },
  { id: "mini_spot", code: "M8", x: 323, y: 230, w: 32, h: 16 },
  { id: "mini_spot", code: "M9", x: 393, y: 230, w: 32, h: 16 },
];

// Heck — viewBox 0 0 320 280
const REAR: Area[] = [
  { id: "heck_goldplatz", code: "HG1", x: 60, y: 75, w: 95, h: 110 },
  { id: "heck_goldplatz", code: "HG2", x: 165, y: 75, w: 95, h: 110 },
  { id: "mini_spot", code: "M10", x: 78, y: 200, w: 60, h: 22 },
  { id: "mini_spot", code: "M10", x: 182, y: 200, w: 60, h: 22 },
];

// Front — viewBox 0 0 320 280
const FRONT: Area[] = [
  { id: "city_spot", code: "C9", x: 75, y: 68, w: 60, h: 24 },
  { id: "mini_spot", code: "M1", x: 145, y: 68, w: 30, h: 24 },
  { id: "city_spot", code: "C10", x: 185, y: 68, w: 60, h: 24 },
];

function AreaRect({
  area,
  active,
  setHover,
  onSelect,
}: {
  area: Area;
  active: PartnerPackageId | null;
  setHover: (id: PartnerPackageId | null) => void;
  onSelect?: (id: PartnerPackageId) => void;
}) {
  const style = STYLES[area.id];
  const isActive = active === area.id;
  return (
    <g
      className="cursor-pointer transition-opacity"
      onMouseEnter={() => setHover(area.id)}
      onMouseLeave={() => setHover(null)}
      onClick={() => onSelect?.(area.id)}
      opacity={active && !isActive ? 0.35 : 1}
    >
      <rect
        x={area.x}
        y={area.y}
        width={area.w}
        height={area.h}
        fill={style.fill}
        fillOpacity={isActive ? FILL_OPACITY[area.id] + 0.1 : FILL_OPACITY[area.id]}
        stroke={style.stroke}
        strokeWidth={isActive ? style.weight + 0.75 : style.weight}
        strokeDasharray={style.dash}
        rx="2"
      />
      <text
        x={area.x + area.w / 2}
        y={area.y + area.h / 2 + 3}
        textAnchor="middle"
        fontSize={Math.min(area.w, area.h) > 40 ? 11 : 8}
        fontWeight="700"
        fill="currentColor"
        style={{ pointerEvents: "none" }}
      >
        {area.code}
      </text>
    </g>
  );
}

function ViewFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mb-2">
        {title}
      </p>
      {children}
    </div>
  );
}

// === Transporter-Silhouetten (monochrom, Citroën Jumper / Peugeot Boxer L4H3) ===

function VanSide({ mirror = false }: { mirror?: boolean }) {
  // viewBox 640x260
  const body = (
    <g>
      {/* Karosserie */}
      <path
        d="M 60 220 L 60 90 Q 60 60 95 60 L 175 60 L 215 28 L 555 28 Q 590 28 590 60 L 590 220 Z"
        fill="var(--secondary)"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* Fahrerhaus-Trennung */}
      <line x1="175" y1="60" x2="175" y2="220" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
      {/* Fahrerfenster */}
      <path
        d="M 82 72 L 82 130 L 162 130 L 162 62 L 180 62 Z"
        fill="var(--background)"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.7"
      />
      {/* Schiebetür-Linien */}
      <line x1="320" y1="62" x2="320" y2="220" stroke="currentColor" strokeWidth="0.8" opacity="0.25" strokeDasharray="2 3" />
      <line x1="490" y1="62" x2="490" y2="220" stroke="currentColor" strokeWidth="0.8" opacity="0.25" strokeDasharray="2 3" />
      {/* Türgriff */}
      <rect x="195" y="170" width="14" height="3" fill="currentColor" opacity="0.4" />
      {/* Räder */}
      <circle cx="138" cy="225" r="26" fill="currentColor" />
      <circle cx="138" cy="225" r="12" fill="var(--background)" />
      <circle cx="500" cy="225" r="26" fill="currentColor" />
      <circle cx="500" cy="225" r="12" fill="var(--background)" />
      {/* Boden */}
      <line x1="20" y1="252" x2="620" y2="252" stroke="currentColor" strokeWidth="1" opacity="0.2" />
    </g>
  );
  return mirror ? <g transform="translate(640,0) scale(-1,1)">{body}</g> : body;
}

function VanRear() {
  return (
    <g>
      {/* Hecktüren-Karosserie */}
      <path
        d="M 50 220 L 50 60 Q 50 38 75 38 L 245 38 Q 270 38 270 60 L 270 220 Z"
        fill="var(--secondary)"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* Türtrennung mittig */}
      <line x1="160" y1="38" x2="160" y2="220" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      {/* Rückleuchten */}
      <rect x="55" y="195" width="22" height="20" fill="currentColor" opacity="0.5" rx="2" />
      <rect x="243" y="195" width="22" height="20" fill="currentColor" opacity="0.5" rx="2" />
      {/* Türgriffe */}
      <circle cx="148" cy="135" r="3" fill="currentColor" opacity="0.5" />
      <circle cx="172" cy="135" r="3" fill="currentColor" opacity="0.5" />
      {/* Boden */}
      <line x1="20" y1="252" x2="300" y2="252" stroke="currentColor" strokeWidth="1" opacity="0.2" />
    </g>
  );
}

function VanFront() {
  return (
    <g>
      {/* Front-Karosserie */}
      <path
        d="M 50 220 L 50 65 Q 50 45 78 45 L 242 45 Q 270 45 270 65 L 270 220 Z"
        fill="var(--secondary)"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* Windschutzscheibe */}
      <path
        d="M 75 100 L 245 100 L 245 60 L 75 60 Z"
        fill="var(--background)"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.7"
      />
      {/* Kühlergrill */}
      <rect x="90" y="155" width="140" height="20" fill="currentColor" opacity="0.35" rx="2" />
      {/* Scheinwerfer */}
      <rect x="60" y="130" width="35" height="20" fill="currentColor" opacity="0.4" rx="3" />
      <rect x="225" y="130" width="35" height="20" fill="currentColor" opacity="0.4" rx="3" />
      {/* Spiegel */}
      <rect x="38" y="88" width="14" height="22" fill="currentColor" opacity="0.5" rx="2" />
      <rect x="268" y="88" width="14" height="22" fill="currentColor" opacity="0.5" rx="2" />
      {/* Boden */}
      <line x1="20" y1="252" x2="300" y2="252" stroke="currentColor" strokeWidth="1" opacity="0.2" />
    </g>
  );
}

export function TransporterDiagram({ highlight, onSelect }: Props) {
  const [hover, setHover] = useState<PartnerPackageId | null>(null);
  const active = hover ?? highlight ?? null;

  return (
    <div className="w-full text-foreground">
      {/* Header-Icons wie Referenz */}
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

      <div className="grid gap-4">
        <ViewFrame title="Links – Fahrerseite">
          <svg viewBox="0 0 640 260" className="w-full h-auto" role="img" aria-label="Fahrerseite mit Werbeflächen">
            <VanSide />
            {LEFT.map((a, i) => (
              <AreaRect key={`L-${a.code}-${i}`} area={a} active={active} setHover={setHover} onSelect={onSelect} />
            ))}
          </svg>
        </ViewFrame>

        <ViewFrame title="Rechts – Beifahrerseite">
          <svg viewBox="0 0 640 260" className="w-full h-auto" role="img" aria-label="Beifahrerseite mit Werbeflächen">
            <VanSide mirror />
            {RIGHT.map((a, i) => (
              <AreaRect key={`R-${a.code}-${i}`} area={a} active={active} setHover={setHover} onSelect={onSelect} />
            ))}
          </svg>
        </ViewFrame>

        <div className="grid grid-cols-2 gap-4">
          <ViewFrame title="Heck – Hecktüren">
            <svg viewBox="0 0 320 280" className="w-full h-auto" role="img" aria-label="Heck mit Werbeflächen">
              <VanRear />
              {REAR.map((a, i) => (
                <AreaRect key={`H-${a.code}-${i}`} area={a} active={active} setHover={setHover} onSelect={onSelect} />
              ))}
            </svg>
          </ViewFrame>
          <ViewFrame title="Front – Frontansicht">
            <svg viewBox="0 0 320 280" className="w-full h-auto" role="img" aria-label="Frontansicht mit Werbeflächen">
              <VanFront />
              {FRONT.map((a, i) => (
                <AreaRect key={`F-${a.code}-${i}`} area={a} active={active} setHover={setHover} onSelect={onSelect} />
              ))}
            </svg>
          </ViewFrame>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Tippe auf eine Fläche, um Details und Preise zu sehen. Empfohlene Ausführung: Magnetfolie 0,9 mm, wetterfest, austauschbar.
      </p>
    </div>
  );
}