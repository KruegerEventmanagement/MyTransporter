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

// Zonen werden 1:1 aus dem Werbeflächenplan übernommen (2010 Citroën Jumper L4H2).
// Die Hintergrundbilder zeigen bereits die Labels (S1..S16, R1..R15, F0/F1, B1..B7);
// die Overlays dienen nur dem Klicken & Hervorheben einer einzelnen Fläche.

function rect(code: string, view: ViewId, x: number, y: number, w: number, h: number): Zone {
  const x2 = x + w;
  const y2 = y + h;
  return {
    code,
    view,
    points: `${x},${y} ${x2},${y} ${x2},${y2} ${x},${y2}`,
    label: { x: x + w / 2, y: y + h / 2 },
  };
}

// ---------- Linke Seite (driver), 970 x 425 ----------
const driverZones: Zone[] = [
  rect("S1",  "driver", 200,  55,  85, 55),
  rect("S2",  "driver", 290,  55, 465, 55),
  rect("S3",  "driver", 760,  55, 120, 55),
  rect("S4",  "driver", 295, 120, 120, 60),
  rect("S5",  "driver", 420, 120, 130, 60),
  rect("S6",  "driver", 555, 120, 130, 60),
  rect("S7",  "driver", 690, 120, 115, 60),
  rect("S8",  "driver", 295, 188,  120, 75),
  rect("S9",  "driver", 420, 188,  130, 75),
  rect("S10", "driver", 555, 188,  130, 75),
  rect("S11", "driver", 690, 188,  115, 75),
  rect("S12", "driver", 810, 188,   75, 75),
  rect("S13", "driver", 305, 278,  115, 38),
  rect("S14", "driver", 425, 278,  115, 38),
  rect("S15", "driver", 548, 278,  108, 38),
  rect("S16", "driver", 662, 278,   95, 38),
];

// ---------- Rechte Seite (passenger), 975 x 420 ----------
const passengerZones: Zone[] = [
  rect("R1",  "passenger",  65,  50, 140, 55),
  rect("R2",  "passenger", 215,  50, 380, 55),
  rect("R3",  "passenger", 605,  50,  80, 55),
  rect("R4",  "passenger",  65, 115, 140, 60),
  rect("R5",  "passenger", 215, 115, 130, 60),
  rect("R6",  "passenger", 360, 115, 130, 60),
  rect("R7",  "passenger", 500, 115, 130, 60),
  rect("R8",  "passenger",  40, 185, 165, 95),
  rect("R9",  "passenger", 215, 215, 135, 65),
  rect("R10", "passenger", 360, 185, 130, 95),
  rect("R11", "passenger", 500, 185, 130, 95),
  rect("R12", "passenger", 635, 215,  90, 65),
  rect("R13", "passenger", 215, 286, 130, 38),
  rect("R14", "passenger", 355, 286, 130, 38),
  rect("R15", "passenger", 495, 286, 130, 38),
];

// ---------- Vorderseite (front), 385 x 420 ----------
const frontZones: Zone[] = [
  rect("F0", "front",  98,  70, 188, 110), // Windschutzscheibe
  rect("F1", "front", 110, 290, 175,  65), // Motorhaube
];

// ---------- Rückseite (rear), 395 x 420 ----------
const rearZones: Zone[] = [
  rect("B1", "rear",  98,  55, 110, 65),
  rect("B2", "rear", 215,  55, 100, 65),
  rect("B3", "rear",  98, 132, 110, 70),
  rect("B4", "rear", 215, 132, 100, 70),
  rect("B5", "rear",  98, 215, 110, 65),
  rect("B6", "rear", 215, 215, 100, 65),
  rect("B7", "rear", 100, 360, 215, 45),
];

export const VIEWS: Record<ViewId, ViewDef> = {
  driver: {
    label: "Linke Seite",
    viewBox: "0 0 970 425",
    aspect: "970 / 425",
    pxPerMeter: 115, // ca. 6 m Karosserielänge im Bild
    ratePerSqmMonth: 100,
    zones: driverZones,
  },
  passenger: {
    label: "Rechte Seite",
    viewBox: "0 0 975 420",
    aspect: "975 / 420",
    pxPerMeter: 115,
    ratePerSqmMonth: 100,
    zones: passengerZones,
  },
  rear: {
    label: "Rückseite",
    viewBox: "0 0 470 500",
    aspect: "470 / 500",
    pxPerMeter: 105, // ca. 2 m Fahrzeugbreite
    ratePerSqmMonth: 130,
    zones: rearZones,
  },
  front: {
    label: "Vorderseite",
    viewBox: "0 0 450 500",
    aspect: "450 / 500",
    pxPerMeter: 105,
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
