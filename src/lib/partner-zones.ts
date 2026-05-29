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

const driverZones: Zone[] = [
  { code: "D1", view: "driver", points: rect(210, 210, 165, 90), label: { x: 292, y: 258 } },
  { code: "D2", view: "driver", points: rect(380, 210, 160, 90), label: { x: 460, y: 258 } },
  { code: "D3", view: "driver", points: rect(300, 510, 240, 170), label: { x: 420, y: 600 } },
  { code: "D4", view: "driver", points: rect(560, 210, 235, 200), label: { x: 677, y: 312 } },
  { code: "D5", view: "driver", points: rect(800, 210, 235, 200), label: { x: 917, y: 312 } },
  { code: "D6", view: "driver", points: rect(1040, 210, 220, 200), label: { x: 1150, y: 312 } },
  { code: "D7", view: "driver", points: rect(1265, 210, 215, 200), label: { x: 1372, y: 312 } },
  { code: "D8", view: "driver", points: rect(560, 415, 235, 215), label: { x: 677, y: 525 } },
  { code: "D9", view: "driver", points: rect(800, 415, 235, 215), label: { x: 917, y: 525 } },
  { code: "D10", view: "driver", points: rect(1040, 415, 220, 215), label: { x: 1150, y: 525 } },
  { code: "D11", view: "driver", points: rect(1265, 415, 215, 215), label: { x: 1372, y: 525 } },
  { code: "D12", view: "driver", points: rect(560, 635, 235, 70), label: { x: 677, y: 672 } },
  { code: "D13", view: "driver", points: rect(800, 635, 235, 70), label: { x: 917, y: 672 } },
  { code: "D14", view: "driver", points: rect(1040, 635, 130, 70), label: { x: 1105, y: 672 } },
  { code: "D15", view: "driver", points: rect(1355, 635, 125, 70), label: { x: 1417, y: 672 } },
  { code: "D16", view: "driver", points: rect(165, 510, 125, 100), label: { x: 227, y: 562 } },
];

const passengerZones: Zone[] = [
  { code: "P1", view: "passenger", points: rect(1000, 210, 165, 90), label: { x: 1082, y: 258 } },
  { code: "P2", view: "passenger", points: rect(1170, 210, 160, 90), label: { x: 1250, y: 258 } },
  { code: "P3", view: "passenger", points: rect(1100, 510, 240, 170), label: { x: 1220, y: 600 } },
  { code: "P4", view: "passenger", points: rect(720, 210, 270, 200), label: { x: 855, y: 312 } },
  { code: "P5", view: "passenger", points: rect(720, 415, 270, 215), label: { x: 855, y: 525 } },
  { code: "P6", view: "passenger", points: rect(485, 210, 230, 200), label: { x: 600, y: 312 } },
  { code: "P7", view: "passenger", points: rect(245, 210, 235, 200), label: { x: 362, y: 312 } },
  { code: "P8", view: "passenger", points: rect(90, 210, 150, 200), label: { x: 165, y: 312 } },
  { code: "P9", view: "passenger", points: rect(485, 415, 230, 215), label: { x: 600, y: 525 } },
  { code: "P10", view: "passenger", points: rect(245, 415, 235, 215), label: { x: 362, y: 525 } },
  { code: "P11", view: "passenger", points: rect(90, 415, 150, 215), label: { x: 165, y: 525 } },
  { code: "P12", view: "passenger", points: rect(485, 635, 230, 70), label: { x: 600, y: 672 } },
  { code: "P13", view: "passenger", points: rect(245, 635, 235, 70), label: { x: 362, y: 672 } },
  { code: "P14", view: "passenger", points: rect(90, 635, 130, 70), label: { x: 155, y: 672 } },
];

const rearZones: Zone[] = [
  { code: "R1", view: "rear", points: rect(220, 175, 290, 70), label: { x: 365, y: 213 } },
  { code: "R2", view: "rear", points: rect(515, 175, 290, 70), label: { x: 660, y: 213 } },
  { code: "R3", view: "rear", points: rect(220, 475, 290, 200), label: { x: 365, y: 580 } },
  { code: "R4", view: "rear", points: rect(515, 475, 290, 200), label: { x: 660, y: 580 } },
  { code: "R5", view: "rear", points: rect(255, 700, 255, 65), label: { x: 382, y: 735 } },
  { code: "R6", view: "rear", points: rect(515, 700, 255, 65), label: { x: 642, y: 735 } },
];

const frontZones: Zone[] = [
  { code: "F1", view: "front", points: rect(265, 145, 490, 75), label: { x: 510, y: 187 } },
  { code: "F2", view: "front", points: rect(285, 460, 450, 105), label: { x: 510, y: 517 } },
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
