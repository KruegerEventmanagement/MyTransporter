## Ziel

Die billigen SVG-Grafiken auf `/partner` durch echte fotorealistische Transporter-Bilder ersetzen. Auf jedem Bild liegen alle Werbeflächen als gestrichelte, leicht ausgegraute Overlays. Die aktuell ausgewählte Fläche wird dick hervorgehoben und zeigt zusätzlich ein Werbe-Mockup (Platzhalter-Logo) auf der Fläche, damit man sieht wie's beklebt aussehen würde.

## Vorgehen

**1. Bilder beschaffen (Mix: Referenzfotos + KI)**
- Per `imagegen` (Modell `premium`, ohne Text-Anforderung) 4 saubere Seitenansichten eines weißen Citroën Jumper L4H3 generieren:
  - `transporter-driver.jpg` (Fahrerseite)
  - `transporter-passenger.jpg` (Beifahrerseite)
  - `transporter-rear.jpg` (Heck)
  - `transporter-front.jpg` (Front)
- Studio-Look, neutraler heller Hintergrund, exakt orthogonale Seitenansicht (kein 3/4-Winkel), damit Overlays sauber sitzen.
- Ein Platzhalter-Werbemotiv generieren (`ad-mockup.jpg` – buntes abstraktes Logo-Muster) für das "Plus Werbe-Mockup"-Verhalten.
- Ablage: `src/assets/partner/`.

**2. Neue Komponente `TransporterPhotoDiagram.tsx`**
Ersetzt die bisherige SVG-Komponente komplett. Aufbau pro Ansicht:
- `<img>` mit dem Fotohintergrund
- Darüber ein absolut positioniertes `<svg>` mit `viewBox` passend zum Foto
- Jede Werbefläche als `<polygon>` (nicht nur Rechtecke – Eckpunkte folgen der Karosserieform: schräge Kanten an A-/C-Säule, ausgeschnittene Ecken um Radkasten/Fenster, wie auf den Referenzfotos echter beklebter Transporter)
- Zustände der Polygone:
  - **nicht ausgewählt**: `fill: white/15%`, `stroke: white/40%`, `stroke-dasharray="6 4"`, dünn (1.5px), Label klein
  - **ausgewählt**: `fill: var(--primary)/0%`, `stroke: var(--primary)`, durchgezogen, dick (3px), Label fett + größerer Hintergrund-Chip; **zusätzlich** wird `ad-mockup.jpg` als `<image>` mit `clipPath` exakt in das Polygon eingepasst (Opacity ~85%, leichter `mix-blend-multiply` für realistischen Folien-Look)
  - **hover**: Zwischenzustand, hellt auf
- Tab-Leiste oben: Fahrerseite | Beifahrerseite | Heck | Front (statt aller 4 untereinander → spart Platz, eine Ansicht groß sichtbar)
- Klick auf Polygon → setzt `selectedPackageId` (gleicher State wie Package-Cards), scrollt Cards in View
- Klick auf Package-Card → wechselt automatisch zur passenden Ansicht und selektiert das Polygon

**3. Koordinaten-Mapping**
- Für jede der 26 Flächen (HS1, HS2, L1, L2, HG1, HG2, C1–C10, M1–M10) Polygon-Koordinaten im `viewBox`-Raum definieren.
- Form orientiert sich an den vom User geschickten Referenzfotos: Hauptsponsor schließt am Radkasten bündig ab (untere Kante folgt der Radkasten-Wölbung als 3-4 Punkte), Heck-Goldplätze umfließen das Rückleuchten-Gehäuse, City-Spots zwischen den Fenstern.
- Definiert in `src/lib/partner-zones.ts` als Map `{ id, view, points: "x1,y1 x2,y2 …", labelAnchor: {x,y} }`.

**4. Anpassungen Bestandsdateien**
- `src/routes/partner.tsx`: Import wechseln auf `TransporterPhotoDiagram`, State (`selectedPackageId`) liften und an beide Kinder durchreichen.
- `src/components/partner/PartnerPackages.tsx`: `onSelect`/`selectedId` Props ergänzen, aktive Karte visuell markieren.
- Alte `src/components/partner/TransporterDiagram.tsx` löschen.

**5. Keine Backend-/Logikänderungen**
- `partner-packages.ts`, `partner-inquiry.functions.ts`, Formular, Preise bleiben unverändert.

## Technische Details

- Bilder als statische Assets, via `import img from '@/assets/partner/transporter-driver.jpg'` eingebunden (Vite hashed sie).
- SVG-Overlay: `position: absolute; inset: 0; width: 100%; height: 100%` über `position: relative` Container.
- `clipPath` pro Polygon mit eindeutiger ID (`clip-hs1`, …) damit das Werbe-Mockup-Bild exakt in der Form sitzt.
- Monochrome Design-Token bleiben respektiert (Schwarz/Weiß/Grau, kein Farbakzent außer im Werbe-Mockup selbst – das darf bunt sein, ist ja eine echte Werbung).
- Responsive: auf Mobile Tab-Leiste scrollbar, SVG-Polygone skalieren automatisch mit dem `viewBox`.

## Was nicht passiert

- Keine Änderungen am Anfrageformular, an Preisen, an Routen oder am Datenmodell.
- Keine Animationen/Motion – bewusst ruhig.
- Kein Versuch, Text in die KI-generierten Bilder zu rendern (KI-Text ist unzuverlässig); alle Labels kommen aus dem SVG-Overlay.
