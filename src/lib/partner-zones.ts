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

// Sponsoren-Raster nach Referenzbild:
//  Reihe A (220–295): Hochdach-Band, 5 kleine Slots über dem Fenster
//  Reihe B (305–500): Hauptflächen — 4 große Werbeplätze (teure Werbung)
//  Reihe C (510–585): schmaler Balken — 4 kleinere Werbungen
//  Reihe D (595–700): untere Karosseriereihe — 3 Slots (Schiebetür / Radhaus ausgespart)
const driverZones: Zone[] = [
  // D1 — Fahrertür (Polygon, vordere Unterkante folgt dem Radkasten)
  {
    code: "D1",
    view: "driver",
    points: "398,475 555,475 555,705 445,705 415,695 400,675 392,650 392,525",
    label: { x: 475, y: 600 },
  },
  // Reihe A — Hochdach-Band (5 kleine Slots)
  { code: "D2", view: "driver", points: "565,225 720,225 720,295 565,295", label: { x: 642, y: 263 } },
  { code: "D3", view: "driver", points: "725,225 880,225 880,295 725,295", label: { x: 802, y: 263 } },
  { code: "D4", view: "driver", points: "885,225 1040,225 1040,295 885,295", label: { x: 962, y: 263 } },
  { code: "D5", view: "driver", points: "1045,225 1200,225 1200,295 1045,295", label: { x: 1122, y: 263 } },
  { code: "D6", view: "driver", points: "1205,225 1370,225 1370,295 1205,295", label: { x: 1287, y: 263 } },
  // Reihe B — Hauptflächen (4 große)
  { code: "D7", view: "driver", points: "565,305 765,305 765,500 565,500", label: { x: 665, y: 405 } },
  { code: "D8", view: "driver", points: "770,305 970,305 970,500 770,500", label: { x: 870, y: 405 } },
  { code: "D9", view: "driver", points: "975,305 1170,305 1170,500 975,500", label: { x: 1072, y: 405 } },
  { code: "D10", view: "driver", points: "1175,305 1370,305 1370,500 1175,500", label: { x: 1272, y: 405 } },
  // Reihe C — schmaler Balken (4 kleinere)
  { code: "D11", view: "driver", points: "565,510 765,510 765,585 565,585", label: { x: 665, y: 550 } },
  { code: "D12", view: "driver", points: "770,510 970,510 970,585 770,585", label: { x: 870, y: 550 } },
  { code: "D13", view: "driver", points: "975,510 1170,510 1170,585 975,585", label: { x: 1072, y: 550 } },
  { code: "D14", view: "driver", points: "1175,510 1370,510 1370,585 1175,585", label: { x: 1272, y: 550 } },
  // Reihe D — untere Karosseriereihe (Schiebetür-/Radhaus-Bereiche ausgespart)
  { code: "D15", view: "driver", points: "565,595 765,595 765,700 565,700", label: { x: 665, y: 648 } },
  { code: "D16", view: "driver", points: "770,595 970,595 970,700 770,700", label: { x: 870, y: 648 } },
  // D17 über dem hinteren Radkasten — Unterkante folgt dem Bogen
  {
    code: "D17",
    view: "driver",
    points: "1175,595 1370,595 1370,700 1335,700 1325,685 1305,672 1275,662 1235,658 1200,663 1180,672 1175,682",
    label: { x: 1272, y: 640 },
  },
  // D18 Heckeck (schmal, zwischen hinterem Radkasten und Rücklicht)
  { code: "D18", view: "driver", points: "1375,305 1445,325 1445,655 1375,655", label: { x: 1415, y: 480 } },
];

// Beifahrerseite — gespiegelt zur Fahrerseite (x' = 1536 − x), gleiche Reihen
const passengerZones: Zone[] = [
  // P1 — Beifahrertür (gespiegelt zu D1)
  {
    code: "P1",
    view: "passenger",
    points: "1138,475 981,475 981,705 1091,705 1121,695 1136,675 1144,650 1144,525",
    label: { x: 1061, y: 600 },
  },
  // Reihe A — Hochdach (5 Slots, von vorne nach hinten = rechts→links)
  { code: "P2", view: "passenger", points: "971,225 816,225 816,295 971,295", label: { x: 894, y: 263 } },
  { code: "P3", view: "passenger", points: "811,225 656,225 656,295 811,295", label: { x: 734, y: 263 } },
  { code: "P4", view: "passenger", points: "651,225 496,225 496,295 651,295", label: { x: 574, y: 263 } },
  { code: "P5", view: "passenger", points: "491,225 336,225 336,295 491,295", label: { x: 414, y: 263 } },
  { code: "P6", view: "passenger", points: "331,225 166,225 166,295 331,295", label: { x: 249, y: 263 } },
  // Reihe B — Hauptflächen (4 große)
  { code: "P7", view: "passenger", points: "971,305 771,305 771,500 971,500", label: { x: 871, y: 405 } },
  { code: "P8", view: "passenger", points: "766,305 566,305 566,500 766,500", label: { x: 666, y: 405 } },
  { code: "P9", view: "passenger", points: "561,305 366,305 366,500 561,500", label: { x: 464, y: 405 } },
  { code: "P10", view: "passenger", points: "361,305 166,305 166,500 361,500", label: { x: 264, y: 405 } },
  // Reihe C — schmaler Balken (4)
  { code: "P11", view: "passenger", points: "971,510 771,510 771,585 971,585", label: { x: 871, y: 550 } },
  { code: "P12", view: "passenger", points: "766,510 566,510 566,585 766,585", label: { x: 666, y: 550 } },
  { code: "P13", view: "passenger", points: "561,510 366,510 366,585 561,585", label: { x: 464, y: 550 } },
  { code: "P14", view: "passenger", points: "361,510 166,510 166,585 361,585", label: { x: 264, y: 550 } },
  // Reihe D — untere Reihe (Schiebetür-Bereich vorhanden, Radhaus ausgespart)
  { code: "P15", view: "passenger", points: "971,595 771,595 771,700 971,700", label: { x: 871, y: 648 } },
  { code: "P16", view: "passenger", points: "766,595 566,595 566,700 766,700", label: { x: 666, y: 648 } },
  // P17 über dem hinteren Radkasten (gespiegelt)
  {
    code: "P17",
    view: "passenger",
    points: "361,595 166,595 166,700 201,700 211,685 231,672 261,662 301,658 336,663 356,672 361,682",
    label: { x: 264, y: 640 },
  },
  // P18 Heckeck links im Bild
  { code: "P18", view: "passenger", points: "161,305 91,325 91,655 161,655", label: { x: 126, y: 480 } },
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
