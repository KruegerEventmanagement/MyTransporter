export type ViewId = "driver" | "passenger" | "rear" | "front";

export interface Zone {
  code: string;
  view: ViewId;
  points: string;
  label: { x: number; y: number };
}

export interface ViewDef {
  label: string;
  viewBox: string;
  aspect: string;
  pxPerMeter: number;
  ratePerSqmMonth: number;
  zones: Zone[];
}

function rect(x: number, y: number, w: number, h: number): string {
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
}

// Polygone liegen ausschließlich auf Karosserieblech.
// Ausgespart: Räder/Radkästen, Stoßfänger, Plastik-Schweller, Fensterscheiben.
// Fahrerseite: Cab links, Heck rechts. Beifahrerseite: gespiegelt.
const driverZones: Zone[] = [
  // Fahrertür-Panel (unter Fenster)
  { code: "D1", view: "driver", points: rect(310, 485, 155, 195), label: { x: 388, y: 583 } },
  // Oberes Frachtraum-Band (über Mittelsicke)
  { code: "D2", view: "driver", points: rect(485, 270, 230, 200), label: { x: 600, y: 370 } },
  { code: "D3", view: "driver", points: rect(715, 270, 230, 200), label: { x: 830, y: 370 } },
  { code: "D4", view: "driver", points: rect(945, 270, 230, 200), label: { x: 1060, y: 370 } },
  { code: "D5", view: "driver", points: rect(1175, 270, 230, 200), label: { x: 1290, y: 370 } },
  // Unteres Frachtraum-Band zwischen den Radkästen (oberhalb der Plastik-Schwellerleiste)
  { code: "D6", view: "driver", points: rect(425, 485, 230, 170), label: { x: 540, y: 570 } },
  { code: "D7", view: "driver", points: rect(660, 485, 230, 170), label: { x: 775, y: 570 } },
  { code: "D8", view: "driver", points: rect(895, 485, 235, 170), label: { x: 1012, y: 570 } },
  // Schmaler Streifen hinter dem hinteren Radkasten
  { code: "D9", view: "driver", points: rect(1345, 485, 60, 170), label: { x: 1375, y: 570 } },
];

const passengerZones: Zone[] = [
  // Beifahrertür-Panel (Cab rechts in dieser Ansicht)
  { code: "P1", view: "passenger", points: rect(1075, 485, 155, 195), label: { x: 1153, y: 583 } },
  // Oberes Frachtraum-Band
  { code: "P2", view: "passenger", points: rect(131, 270, 230, 200), label: { x: 246, y: 370 } },
  { code: "P3", view: "passenger", points: rect(361, 270, 230, 200), label: { x: 476, y: 370 } },
  { code: "P4", view: "passenger", points: rect(591, 270, 230, 200), label: { x: 706, y: 370 } },
  { code: "P5", view: "passenger", points: rect(821, 270, 230, 200), label: { x: 936, y: 370 } },
  // Unteres Frachtraum-Band (mit Schiebetür-Panel)
  { code: "P6", view: "passenger", points: rect(406, 485, 230, 170), label: { x: 521, y: 570 } },
  { code: "P7", view: "passenger", points: rect(641, 485, 230, 170), label: { x: 756, y: 570 } },
  { code: "P8", view: "passenger", points: rect(876, 485, 235, 170), label: { x: 993, y: 570 } },
  // Schmaler Streifen hinter dem hinteren Radkasten
  { code: "P9", view: "passenger", points: rect(131, 485, 60, 170), label: { x: 161, y: 570 } },
];

const rearZones: Zone[] = [
  // Header-Panel über den Heckscheiben
  { code: "R1", view: "rear", points: rect(255, 160, 255, 85), label: { x: 382, y: 202 } },
  { code: "R2", view: "rear", points: rect(515, 160, 255, 85), label: { x: 642, y: 202 } },
  // Türflächen unter den Heckscheiben (über Plastik-Stoßfänger)
  { code: "R3", view: "rear", points: rect(255, 475, 255, 245), label: { x: 382, y: 597 } },
  { code: "R4", view: "rear", points: rect(515, 475, 255, 245), label: { x: 642, y: 597 } },
];

const frontZones: Zone[] = [
  // Dachstreifen über Windschutzscheibe
  { code: "F1", view: "front", points: rect(295, 135, 435, 90), label: { x: 512, y: 180 } },
  // Motorhaube (unter Scheibe, über schwarzem Stoßfänger)
  { code: "F2", view: "front", points: rect(265, 445, 495, 125), label: { x: 512, y: 507 } },
];

export const VIEWS: Record<ViewId, ViewDef> = {
  driver: {
    label: "Fahrerseite",
    viewBox: "0 0 1536 1024",
    aspect: "1536 / 1024",
    pxPerMeter: 220,
    ratePerSqmMonth: 100,
    zones: driverZones,
  },
  passenger: {
    label: "Beifahrerseite",
    viewBox: "0 0 1536 1024",
    aspect: "1536 / 1024",
    pxPerMeter: 220,
    ratePerSqmMonth: 100,
    zones: passengerZones,
  },
  rear: {
    label: "Heck",
    viewBox: "0 0 1024 1024",
    aspect: "1 / 1",
    pxPerMeter: 297,
    ratePerSqmMonth: 120,
    zones: rearZones,
  },
  front: {
    label: "Front",
    viewBox: "0 0 1024 1024",
    aspect: "1 / 1",
    pxPerMeter: 366,
    ratePerSqmMonth: 140,
    zones: frontZones,
  },
};

export function polygonAreaPx(points: string): number {
  const coords = points
    .trim()
    .split(/\s+/)
    .map((p) => {
      const [x, y] = p.split(",").map(Number);
      return { x, y };
    });
  let sum = 0;
  for (let i = 0; i < coords.length; i++) {
    const a = coords[i];
    const b = coords[(i + 1) % coords.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonBBox(points: string) {
  const coords = points
    .trim()
    .split(/\s+/)
    .map((p) => p.split(",").map(Number));
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

export function getViewForZone(code: string): ViewId {
  for (const [id, v] of Object.entries(VIEWS) as [ViewId, ViewDef][]) {
    if (v.zones.some((z) => z.code === code)) return id;
  }
  return "driver";
}

export const ALL_ZONES: Zone[] = (Object.keys(VIEWS) as ViewId[]).flatMap(
  (v) => VIEWS[v].zones,
);
