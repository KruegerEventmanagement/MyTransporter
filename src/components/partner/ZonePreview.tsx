import { VIEWS, type ViewId } from "@/lib/partner-zones";
import driverImg from "@/assets/partner/van-driver.jpg";
import passengerImg from "@/assets/partner/van-passenger.jpg";
import rearImg from "@/assets/partner/van-rear.jpg";
import frontImg from "@/assets/partner/van-front.jpg";

const IMAGES: Record<ViewId, string> = {
  driver: driverImg,
  passenger: passengerImg,
  rear: rearImg,
  front: frontImg,
};

interface Props {
  view: ViewId;
  code?: string | null;
  className?: string;
}

/**
 * Kleines Vorschaubild der Fahrzeugansicht mit schraffiert markierter Werbefläche.
 * Die Markierung nutzt exakt das Polygon der Zone aus partner-zones.ts.
 */
export function ZonePreview({ view, code, className }: Props) {
  const def = VIEWS[view];
  const zone = code ? def.zones.find((z) => z.code === code) : null;
  const patternId = `hatch-${view}-${code ?? "none"}`;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-border bg-secondary ${className ?? ""}`}
      style={{ aspectRatio: def.aspect }}
    >
      <img
        src={IMAGES[view]}
        alt={`${def.label} des Transporters${zone ? ` mit markierter Werbefläche ${zone.code}` : ""}`}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-contain"
      />
      {zone && (
        <svg
          viewBox={def.viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id={patternId}
              patternUnits="userSpaceOnUse"
              width="10"
              height="10"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="10"
                stroke="currentColor"
                strokeWidth="3"
                className="text-foreground"
                opacity="0.55"
              />
            </pattern>
          </defs>
          <polygon
            points={zone.points}
            fill={`url(#${patternId})`}
            stroke="currentColor"
            strokeWidth="3"
            className="text-foreground"
          />
        </svg>
      )}
      {zone && (
        <span className="absolute left-2 top-2 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-background">
          {zone.code}
        </span>
      )}
    </div>
  );
}
