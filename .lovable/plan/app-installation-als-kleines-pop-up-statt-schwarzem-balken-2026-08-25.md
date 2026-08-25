# App-Installation als kleines Pop-up statt schwarzem Balken

## Ziel
Der durchgehende schwarze Balken „Als App installieren" oben verdeckt die Registrieren/Login-Buttons rechts und die Werbefläche. Er wird durch ein kleines, dezent pulsierendes schwarzes Pop-up ersetzt, das oben links unterhalb der Werbefläche erscheint und niemanden blockiert.

## Was sich ändert
- Der volle schwarze Streifen oben verschwindet vollständig.
- Stattdessen erscheint ein kompaktes schwarzes Pop-up (abgerundete Kachel mit Download-Symbol, Text „App installieren" und kleinem Schließen-X) links oben, unterhalb des Werbebanners.
- Das Pop-up erscheint mit kurzer Verzögerung, gleitet sanft ein und pulsiert leicht (weicher Glow/Puls-Ring), damit es auffällt, ohne zu nerven.
- Klick auf das Pop-up löst wie bisher die echte Installation aus: nativer Installations-Dialog wenn verfügbar, sonst die vorhandene Schritt-für-Schritt-Anleitung (iOS Safari / iOS andere Browser / Android / Desktop).
- Schließen merkt sich die Entscheidung wie bisher für die Sitzung; im installierten Zustand oder im Vorschau-Iframe erscheint nichts.
- Auf Mobil sitzt das Pop-up links über der Seite, mit Abstand zur Navigation, damit es die Buttons nicht überlagert.

## Technische Details
- `src/components/InstallBanner.tsx`: sticky Full-Width-Leiste durch ein `fixed` positioniertes, kompaktes Element ersetzen (links, unterhalb Navbar-/Werbebanner-Höhe, z-Index unter den Dialogen, aber über dem Inhalt). Bestehende Logik unverändert lassen: `beforeinstallprompt`-Handling, `appinstalled`, `sessionStorage`-Dismiss, Plattformerkennung, `InstallGuide`-Dialog.
- Puls-Animation über Tailwind-Utilities plus eine Keyframe-Definition in `src/styles.css` (monochrom, kein Farbakzent).
- `src/routes/__root.tsx`: bleibt Einbindungsort; da das Element nicht mehr im Layoutfluss sitzt, entfällt die durch die Leiste verursachte Verschiebung. Falls `pt-12` in `src/routes/index.tsx` dadurch zu viel/zu wenig Abstand ergibt, Abstand angleichen.
- Kein Service Worker und keine Offline-Funktion wird hinzugefügt; Installierbarkeit läuft weiter über das bestehende Manifest.
