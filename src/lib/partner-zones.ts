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
