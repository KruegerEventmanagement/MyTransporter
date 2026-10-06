/**
 * Sehr einfache, gestrichelte Aufnahmehilfen pro Rückgabe-Perspektive.
 * Bewusst schematisch (keine Fotorealistik), monochrom über currentColor.
 */
export type OutlineKind = "front" | "back" | "left" | "right" | "interior" | "dashboard" | "receipt";

const common = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 3,
  strokeDasharray: "8 6",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Side({ flip }: { flip?: boolean }) {
  return (
    <g transform={flip ? "translate(320 0) scale(-1 1)" : undefined}>
      {/* Kastenwagen-Seitenansicht: Front rechts */}
      <path {...common} d="M20 140 V60 Q20 40 40 40 H215 Q235 40 248 58 L285 100 Q300 106 300 122 V140 Z" />
      <path {...common} d="M222 52 L262 100 H222 Z" />
      <path {...common} d="M120 52 V132" />
      <circle {...common} cx="75" cy="145" r="20" />
      <circle {...common} cx="250" cy="145" r="20" />
    </g>
  );
}

export function ReturnSlotOutline({ kind, className = "" }: { kind: OutlineKind; className?: string }) {
  return (
    <svg
      viewBox="0 0 320 180"
      role="img"
      aria-label={`Aufnahmehilfe: ${LABEL[kind]}`}
      data-testid={`outline-${kind}`}
      className={`w-full h-auto text-muted-foreground ${className}`}
    >
      {kind === "right" && <Side />}
      {kind === "left" && <Side flip />}
      {kind === "front" && (
        <g>
          <path {...common} d="M80 150 V60 Q80 30 110 30 H210 Q240 30 240 60 V150 Z" />
          <path {...common} d="M95 45 H225 V90 H95 Z" />
          <path {...common} d="M95 110 H125 M195 110 H225" />
          <path {...common} d="M130 130 H190" />
          <path {...common} d="M70 150 H250" />
        </g>
      )}
      {kind === "back" && (
        <g>
          <path {...common} d="M80 150 V45 Q80 30 95 30 H225 Q240 30 240 45 V150 Z" />
          <path {...common} d="M160 30 V150" />
          <path {...common} d="M95 45 H150 V80 H95 Z M170 45 H225 V80 H170 Z" />
          <path {...common} d="M85 120 H100 M220 120 H235" />
          <path {...common} d="M70 150 H250" />
        </g>
      )}
      {kind === "interior" && (
        <g>
          <path {...common} d="M30 160 Q60 60 160 50 Q260 60 290 160" />
          <circle {...common} cx="110" cy="115" r="28" />
          <path {...common} d="M190 95 H260 V140 H190 Z" />
          <path {...common} d="M40 160 H280" />
        </g>
      )}
      {kind === "dashboard" && (
        <g>
          <path {...common} d="M30 150 V60 Q30 35 60 35 H260 Q290 35 290 60 V150 Z" />
          <circle {...common} cx="115" cy="95" r="40" />
          <path {...common} d="M115 95 L140 72" />
          <path {...common} d="M195 70 H265 V95 H195 Z" />
          <path {...common} d="M195 115 Q230 100 265 115" />
          <path {...common} d="M195 115 V130 M265 115 V130" />
        </g>
      )}
      {kind === "receipt" && (
        <g>
          <path {...common} d="M115 15 H205 V165 L190 155 L175 165 L160 155 L145 165 L130 155 L115 165 Z" />
          <path {...common} d="M130 45 H190 M130 70 H190 M130 95 H175 M130 125 H190" />
        </g>
      )}
    </svg>
  );
}

const LABEL: Record<OutlineKind, string> = {
  front: "Fahrzeug vorne",
  back: "Fahrzeug hinten",
  left: "linke Seite",
  right: "rechte Seite",
  interior: "Innenraum",
  dashboard: "Kilometer- und Tankanzeige",
  receipt: "Tankbeleg",
};
