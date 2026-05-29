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

// ---------- Linke Seite (driver) — 970 x 425 ----------
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

// ---------- Rechte Seite (passenger) — 975 x 420 ----------
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

// ---------- Vorderseite (front) — 385 x 420 ----------
const frontZones: Zone[] = [
  rect("F0", "front",  98,  70, 188, 110), // Windschutzscheibe
  rect("F1", "front", 110, 290, 175,  65), // Motorhaube
];

// ---------- Rückseite (rear) — 395 x 420 ----------
const rearZones: Zone[] = [
  rect("B1", "rear",  98,  55, 110, 65),
  rect("B2", "rear", 215,  55, 100, 65),
  rect("B3", "rear",  98, 132, 110, 70),
  rect("B4", "rear", 215, 132, 100, 70),
  rect("B5", "rear",  98, 215, 110, 65),
  rect("B6", "rear", 215, 215, 100, 65),
  rect("B7", "rear", 100, 360, 215, 45),
];

// All polygon coordinates derived from the actual van photos
// (van-driver.jpg / van-passenger.jpg: 1536×1024 — van-rear.jpg / van-front.jpg: 1024×1024)
// Each zone hugs the real sheet-metal panel: rounded corners follow wheel arches,
// triangular corners follow the cab roof curve, rear corner tapers upward.

const driverZones: Zone[] = [
  // D1 — Fahrertür (Trapez, vordere Unterkante folgt dem Radkasten-Bogen)
  {
    code: "D1",
    view: "driver",
    points: "395,470 555,470 555,720 440,720 410,710 395,690 388,665 388,520",
    label: { x: 475, y: 600 },
  },
  // D2–D5 — obere Lade-Reihe (4 Kacheln) — Cab-Fenster wird nicht beklebt
  {
    code: "D2",
    view: "driver",
    points: "565,310 765,310 765,510 565,510",
    label: { x: 665, y: 410 },
  },
  {
    code: "D3",
    view: "driver",
    points: "770,310 970,310 970,510 770,510",
    label: { x: 870, y: 410 },
  },
  {
    code: "D4",
    view: "driver",
    points: "975,310 1170,310 1170,510 975,510",
    label: { x: 1072, y: 410 },
  },
  {
    code: "D5",
    view: "driver",
    points: "1175,310 1370,310 1370,510 1175,510",
    label: { x: 1272, y: 410 },
  },
  // D6–D9 — untere Lade-Reihe (4 Kacheln)
  {
    code: "D6",
    view: "driver",
    points: "565,515 765,515 765,720 565,720",
    label: { x: 665, y: 617 },
  },
  {
    code: "D7",
    view: "driver",
    points: "770,515 970,515 970,720 770,720",
    label: { x: 870, y: 617 },
  },
  // D8 — vor dem hinteren Radkasten
  {
    code: "D8",
    view: "driver",
    points: "975,515 1170,515 1170,720 975,720",
    label: { x: 1072, y: 605 },
  },
  // D9 — über dem hinteren Radkasten: Unterkante folgt dem Radkasten-Bogen
  {
    code: "D9",
    view: "driver",
    points: "1175,515 1370,515 1370,720 1335,720 1325,700 1305,680 1275,665 1235,660 1200,665 1180,675 1175,685",
    label: { x: 1272, y: 605 },
  },
  // D10 — Heckeck (schmale Fläche zwischen hinterem Radkasten und Rücklicht)
  {
    code: "D10",
    view: "driver",
    points: "1375,310 1445,330 1445,665 1375,665",
    label: { x: 1415, y: 520 },
  },
];

// Beifahrerseite — gespiegelt (van schaut nach rechts, x ≈ 1536 - x_driver)
const passengerZones: Zone[] = [
  // P1 — Beifahrertür (gespiegelt zu D1)
  {
    code: "P1",
    view: "passenger",
    points: "1141,470 981,470 981,720 1096,720 1126,710 1141,690 1148,665 1148,520",
    label: { x: 1061, y: 600 },
  },
  // P2–P5 — obere Lade-Reihe (von vorne nach hinten, also rechts→links im Bild)
  {
    code: "P2",
    view: "passenger",
    points: "971,310 771,310 771,510 971,510",
    label: { x: 871, y: 410 },
  },
  {
    code: "P3",
    view: "passenger",
    points: "766,310 566,310 566,510 766,510",
    label: { x: 666, y: 410 },
  },
  {
    code: "P4",
    view: "passenger",
    points: "561,310 366,310 366,510 561,510",
    label: { x: 464, y: 410 },
  },
  {
    code: "P5",
    view: "passenger",
    points: "361,310 166,310 166,510 361,510",
    label: { x: 264, y: 410 },
  },
  // P6–P9 — untere Lade-Reihe
  {
    code: "P6",
    view: "passenger",
    points: "971,515 771,515 771,720 971,720",
    label: { x: 871, y: 617 },
  },
  {
    code: "P7",
    view: "passenger",
    points: "766,515 566,515 566,720 766,720",
    label: { x: 666, y: 617 },
  },
  // P8 — vor hinterem Radkasten
  {
    code: "P8",
    view: "passenger",
    points: "561,515 366,515 366,720 561,720",
    label: { x: 464, y: 617 },
  },
  // P9 — über hinterem Radkasten: Unterkante folgt dem Bogen
  {
    code: "P9",
    view: "passenger",
    points: "361,515 166,515 166,720 201,720 211,700 231,680 261,665 301,660 336,665 356,675 361,685",
    label: { x: 264, y: 605 },
  },
  // P10 — Heckeck links im Bild
  {
    code: "P10",
    view: "passenger",
    points: "161,310 91,330 91,665 161,665",
    label: { x: 126, y: 520 },
  },
];

const rearZones: Zone[] = [
  // R1 / R2 — Header oberhalb der Fenster (links / rechts der Mittelnaht)
  {
    code: "R1",
    view: "rear",
    points: "275,175 510,175 510,255 275,255",
    label: { x: 392, y: 218 },
  },
  {
    code: "R2",
    view: "rear",
    points: "514,175 749,175 749,255 514,255",
    label: { x: 631, y: 218 },
  },
  // R3 / R4 — Türpanele unter den Fenstern, oberhalb des Stoßfängers
  {
    code: "R3",
    view: "rear",
    points: "275,490 510,490 510,690 275,690",
    label: { x: 392, y: 590 },
  },
  {
    code: "R4",
    view: "rear",
    points: "514,490 749,490 749,690 514,690",
    label: { x: 631, y: 590 },
  },
];

const frontZones: Zone[] = [
  // F1 — Dachstreifen über der Windschutzscheibe (Trapez, oben schmaler)
  {
    code: "F1",
    view: "front",
    points: "320,135 705,135 730,225 290,225",
    label: { x: 512, y: 188 },
  },
  // F2 — Motorhaube zwischen Scheinwerfern (zwischen den schwarzen Plastik-Teilen)
  {
    code: "F2",
    view: "front",
    points: "365,475 660,475 680,540 350,540",
    label: { x: 512, y: 510 },
  },
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
    viewBox: "0 0 395 420",
    aspect: "395 / 420",
    pxPerMeter: 105, // ca. 2 m Fahrzeugbreite
    ratePerSqmMonth: 130,
    zones: rearZones,
  },
  front: {
    label: "Vorderseite",
    viewBox: "0 0 385 420",
    aspect: "385 / 420",
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
