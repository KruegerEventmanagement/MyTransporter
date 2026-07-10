## Ziel
Im `DocumentScanner` soll der Nutzer auf das Kamerabild tappen können, damit die Kamera an dieser Stelle fokussiert und das Dokument schärfer wird.

## Umsetzung

### 1. Fokus-Handler in `src/components/DocumentScanner.tsx`
- Ein `onPointerDown`/`onClick`-Handler auf dem `<video>`-Element registrieren.
- Die Tap-Koordinaten relativ zum Video-Element berechnen (0–1 normiert).
- Den aktiven `MediaStreamTrack` aus `streamRef.current` holen.
- Falls das Gerät `focusMode: "manual"` und `pointsOfInterest` unterstützt:
  - `focusMode: "manual"`
  - `pointsOfInterest: [{ x, y }]`
  - anschließend kurz danach wieder `focusMode: "continuous"` zurücksetzen, damit die Kamera danach weiter nachscharf.
- Falls nicht unterstützt, wird der Tap visuell bestätigt, aber es passiert nichts weiter (graceful degradation).

### 2. Visuelles Feedback
- Einen kleinen Fokus-Ring (z. B. weißes Quadrat oder Kreuz) an der Tap-Position kurz einblenden.
- Nach ca. 800 ms wieder ausblenden.
- Der Ring darf nicht die Bedienung blockieren (`pointer-events-none`).

### 3. UX-Details
- Der Klick auf das Video soll nicht versehentlich ein Foto auslösen – Auslöser bleibt der separate Shutter-Button.
- Der bestehende Dokumenten-Rahmen-Overlay bleibt `pointer-events-none`, damit Taps durchgängig auf das Video durchkommen.
- Der Fokus-Handler wird nur im `camera`-Phase aktiv sein.

### 4. Optional: `CameraCapture.tsx`
- Die gleiche Tap-to-Fokus-Logik kann optional auch auf das allgemeine Fahrzeug-/Schaden-Kamera-Overlay übertragen werden, falls gewünscht.

## Dateien
- `src/components/DocumentScanner.tsx` (Hauptänderung)
- Optional: `src/components/CameraCapture.tsx`

## Ergebnis
Nutzer tippt auf die unscharfe Stelle des Dokuments → Kamera fokussiert dort → Dokument wird schärfer → danach wird wie gewohnt mit dem Auslöser fotografiert.