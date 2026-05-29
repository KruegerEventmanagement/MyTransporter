import type { PartnerPackageId } from "./partner-packages";

export type ViewId = "driver" | "passenger" | "rear" | "front";

export interface Zone {
  /** Eindeutige Slot-Bezeichnung (z. B. "HS1") */
  code: string;
  /** Welches Paket diese Fläche repräsentiert */
  pkg: PartnerPackageId;
  /** SVG-Polygonpunkte im viewBox-Koordinatensystem */
  points: string;
  /** Ankerpunkt für das Label */
  label: { x: number; y: number };
}

/**
 * Pro Ansicht: viewBox-Maße + Flächen-Polygone.
 * viewBox matcht das jeweilige Foto-Seitenverhältnis (Seitenfotos 2:1, Heck/Front 1:1).
 * Polygonformen folgen grob der Karosserie (Wölbungen am Radkasten, Aussparungen
 * für Fenster), wie auf den Referenzfotos echter beklebter Transporter.
 */

export const VIEWS: Record<
  ViewId,
  { label: string; viewBox: string; aspect: string; zones: Zone[] }
> = {
  driver: {
    label: "Fahrerseite",
    viewBox: "0 0 1600 800",
    aspect: "16 / 8",
    zones: [
      // Hauptsponsor – große Seitenfläche, untere Kante folgt Radkasten
      {
        code: "HS1",
        pkg: "hauptsponsor",
        points:
          "560,240 1180,240 1180,560 1130,580 1080,560 700,560 660,600 600,600 560,580",
        label: { x: 870, y: 410 },
      },
      // Leschi – Premium hinten neben HS
      {
        code: "L1",
        pkg: "leschi",
        points: "1210,260 1490,260 1490,540 1430,560 1380,540 1210,540",
        label: { x: 1350, y: 410 },
      },
      // City-Spots – Reihe oben über Hauptsponsor (auf dem höheren Karosserieteil)
      {
        code: "C1",
        pkg: "city_spot",
        points: "590,170 770,170 770,230 590,230",
        label: { x: 680, y: 205 },
      },
      {
        code: "C2",
        pkg: "city_spot",
        points: "790,170 970,170 970,230 790,230",
        label: { x: 880, y: 205 },
      },
      {
        code: "C3",
        pkg: "city_spot",
        points: "990,170 1170,170 1170,230 990,230",
        label: { x: 1080, y: 205 },
      },
      // Mini-Spots – kleine Logo-Plätze auf der Cab-Tür
      {
        code: "M1",
        pkg: "mini_spot",
        points: "405,440 525,440 525,520 405,520",
        label: { x: 465, y: 485 },
      },
      {
        code: "M2",
        pkg: "mini_spot",
        points: "405,535 525,535 525,610 405,610",
        label: { x: 465, y: 577 },
      },
    ],
  },

  passenger: {
    label: "Beifahrerseite",
    viewBox: "0 0 1600 800",
    aspect: "16 / 8",
    zones: [
      {
        code: "HS2",
        pkg: "hauptsponsor",
        points:
          "440,240 1060,240 1060,580 1020,600 960,600 920,560 540,560 490,580 440,560",
        label: { x: 750, y: 410 },
      },
      {
        code: "L2",
        pkg: "leschi",
        points: "1090,260 1380,260 1380,540 1210,540 1160,560 1090,540",
        label: { x: 1235, y: 410 },
      },
      {
        code: "C4",
        pkg: "city_spot",
        points: "470,170 650,170 650,230 470,230",
        label: { x: 560, y: 205 },
      },
      {
        code: "C5",
        pkg: "city_spot",
        points: "670,170 850,170 850,230 670,230",
        label: { x: 760, y: 205 },
      },
      {
        code: "C6",
        pkg: "city_spot",
        points: "870,170 1050,170 1050,230 870,230",
        label: { x: 960, y: 205 },
      },
      {
        code: "C7",
        pkg: "city_spot",
        points: "1070,170 1250,170 1250,230 1070,230",
        label: { x: 1160, y: 205 },
      },
      {
        code: "M3",
        pkg: "mini_spot",
        points: "1410,440 1530,440 1530,520 1410,520",
        label: { x: 1470, y: 485 },
      },
      {
        code: "M4",
        pkg: "mini_spot",
        points: "1410,535 1530,535 1530,610 1410,610",
        label: { x: 1470, y: 577 },
      },
      {
        code: "M5",
        pkg: "mini_spot",
        points: "300,310 420,310 420,400 300,400",
        label: { x: 360, y: 358 },
      },
    ],
  },

  rear: {
    label: "Heck",
    viewBox: "0 0 1024 1024",
    aspect: "1 / 1",
    zones: [
      // Heck-Goldplätze – linke und rechte Hecktür, oben gerundet, unten umfließen sie die Rückleuchte
      {
        code: "HG1",
        pkg: "heck_goldplatz",
        points:
          "260,280 490,280 490,690 360,690 340,650 260,650",
        label: { x: 375, y: 470 },
      },
      {
        code: "HG2",
        pkg: "heck_goldplatz",
        points:
          "534,280 764,280 764,650 684,650 664,690 534,690",
        label: { x: 649, y: 470 },
      },
      // City-Spots – schmaler oben über den Türen
      {
        code: "C8",
        pkg: "city_spot",
        points: "270,225 490,225 490,270 270,270",
        label: { x: 380, y: 250 },
      },
      {
        code: "C9",
        pkg: "city_spot",
        points: "534,225 754,225 754,270 534,270",
        label: { x: 644, y: 250 },
      },
      // Mini-Spots – unter Hecktür (auf Stoßstange-Bereich), klein
      {
        code: "M6",
        pkg: "mini_spot",
        points: "300,705 460,705 460,760 300,760",
        label: { x: 380, y: 735 },
      },
      {
        code: "M7",
        pkg: "mini_spot",
        points: "564,705 724,705 724,760 564,760",
        label: { x: 644, y: 735 },
      },
    ],
  },

  front: {
    label: "Front",
    viewBox: "0 0 1024 1024",
    aspect: "1 / 1",
    zones: [
      // City-Spot über der Windschutzscheibe (Dachvorderkante)
      {
        code: "C10",
        pkg: "city_spot",
        points: "330,205 690,205 690,275 330,275",
        label: { x: 510, y: 240 },
      },
      // Mini-Spots auf Motorhaube / unterhalb Grill
      {
        code: "M8",
        pkg: "mini_spot",
        points: "380,520 510,520 510,585 380,585",
        label: { x: 445, y: 555 },
      },
      {
        code: "M9",
        pkg: "mini_spot",
        points: "525,520 655,520 655,585 525,585",
        label: { x: 590, y: 555 },
      },
      {
        code: "M10",
        pkg: "mini_spot",
        points: "380,680 655,680 655,735 380,735",
        label: { x: 517, y: 710 },
      },
    ],
  },
};