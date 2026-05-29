import { useState } from "react";
import type { PartnerPackageId } from "@/lib/partner-packages";

interface Area {
  id: PartnerPackageId;
  // SVG coordinates (viewBox 0 0 600 280)
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

const AREAS: Area[] = [
  { id: "large", x: 175, y: 95, w: 235, h: 95, label: "200 × 100 cm" },
  { id: "medium", x: 420, y: 110, w: 95, h: 60, label: "100 × 60 cm" },
  { id: "small", x: 240, y: 60, w: 80, h: 30, label: "50 × 30 cm" },
  { id: "tailgate", x: 525, y: 95, w: 55, h: 95, label: "120 × 80 cm" },
];

interface Props {
  highlight?: PartnerPackageId | null;
  onSelect?: (id: PartnerPackageId) => void;
}

export function TransporterDiagram({ highlight, onSelect }: Props) {
  const [hover, setHover] = useState<PartnerPackageId | null>(null);
  const active = hover ?? highlight ?? null;

  return (
    <div className="w-full">
      <svg
        viewBox="0 0 600 280"
        className="w-full h-auto"
        role="img"
        aria-label="Transporter Seitenansicht mit buchbaren Werbeflächen"
      >
        {/* Boden */}
        <line x1="20" y1="245" x2="580" y2="245" stroke="currentColor" strokeWidth="1" opacity="0.2" />

        {/* Karosserie */}
        <path
          d="M 60 220 L 60 90 Q 60 60 90 60 L 170 60 L 200 30 L 510 30 Q 540 30 540 60 L 540 220 Z"
          fill="hsl(var(--secondary))"
          stroke="currentColor"
          strokeWidth="2"
        />
        {/* Fahrerhaus-Trennung */}
        <line x1="170" y1="60" x2="170" y2="220" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        {/* Fahrerfenster */}
        <path
          d="M 80 80 L 80 130 L 160 130 L 160 70 L 175 70 Z"
          fill="hsl(var(--background))"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.7"
        />
        {/* Heckkante (Tür) */}
        <line x1="510" y1="40" x2="510" y2="220" stroke="currentColor" strokeWidth="1.5" opacity="0.3" strokeDasharray="2 3" />
        {/* Türgriffe / Details */}
        <rect x="190" y="195" width="20" height="3" fill="currentColor" opacity="0.4" />
        <rect x="350" y="195" width="20" height="3" fill="currentColor" opacity="0.4" />

        {/* Räder */}
        <circle cx="135" cy="225" r="26" fill="currentColor" />
        <circle cx="135" cy="225" r="12" fill="hsl(var(--background))" />
        <circle cx="455" cy="225" r="26" fill="currentColor" />
        <circle cx="455" cy="225" r="12" fill="hsl(var(--background))" />

        {/* Werbeflächen */}
        {AREAS.map((a) => {
          const isActive = active === a.id;
          return (
            <g
              key={a.id}
              className="cursor-pointer"
              onMouseEnter={() => setHover(a.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(a.id)}
            >
              <rect
                x={a.x}
                y={a.y}
                width={a.w}
                height={a.h}
                fill={isActive ? "currentColor" : "transparent"}
                fillOpacity={isActive ? 0.08 : 0}
                stroke="currentColor"
                strokeWidth={isActive ? 2 : 1.5}
                strokeDasharray="6 4"
                rx="2"
              />
              <text
                x={a.x + a.w / 2}
                y={a.y + a.h / 2 + 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill="currentColor"
                opacity={isActive ? 1 : 0.7}
                style={{ pointerEvents: "none" }}
              >
                {a.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Tippe auf eine gestrichelte Fläche, um Details und Preise zu sehen.
      </p>
    </div>
  );
}