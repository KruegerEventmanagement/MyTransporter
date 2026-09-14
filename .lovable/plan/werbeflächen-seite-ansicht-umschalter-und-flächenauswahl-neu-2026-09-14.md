# Werbeflächen-Seite: Ansicht-Umschalter und Flächenauswahl neu

## 1. Umschalter statt Schieberegler

Die vier Schaltflächen (Linke Seite, Rechte Seite, Rückseite, Vorderseite) werden künftig alle gleichzeitig sichtbar dargestellt – auf dem Handy als 2x2-Raster, auf größeren Bildschirmen in einer Reihe. Kein horizontales Wischen mehr, nichts läuft aus dem Bild.

## 2. Endlose Kachelliste wird zur Auswahl mit Vorschau

Statt aller ~40 Flächen untereinander:

- Ein Auswahlfeld (Dropdown) für die Seite: Linke Seite / Rechte Seite / Vorderseite / Rückseite
- Ein zweites Auswahlfeld für die Fläche dieser Seite (z. B. „S2 · ca. 400 x 48 cm · 89 €")
- Darunter eine Ergebniskarte mit Größe, Fläche in m², Monatspreis, Laufzeit-Staffel (1/2/3 Jahre) und Folienproduktion
- Rechts daneben (auf dem Handy darüber) ein kleines Vorschaubild: das Foto der jeweiligen Fahrzeugseite, auf dem genau die gewählte Fläche schraffiert markiert ist – Motorhaube bei „vorne Motorhaube", Hecktür bei den Heckflächen usw.
- Kompakter Link „Alle Flächen anzeigen", der auf Wunsch die bisherige vollständige Kachelliste ausklappt (bleibt für Vergleicher erhalten)

Die Preise, Flächengrößen und Laufzeiten bleiben unverändert.

## Technische Umsetzung

- `TransporterPhotoDiagram.tsx`: Tab-Zeile von `overflow-x-auto` auf `grid grid-cols-2 sm:grid-cols-4` umstellen.
- Neue Komponente `src/components/partner/ZonePreview.tsx`: rendert das bestehende Foto der Ansicht plus ein SVG-Overlay mit `<pattern>`-Schraffur über das Polygon der gewählten Zone aus `partner-zones.ts` (`viewBox` je Ansicht, `points` der Zone). Damit sitzt die Markierung exakt auf der richtigen Stelle jeder der ~40 Flächen – ein KI-Bild pro Fläche wäre nicht lagegenau und würde die Codes nicht treffen.
- Neue Komponente `src/components/partner/PartnerAreaPicker.tsx`: zwei Selects (shadcn `Select`) für Ansicht + Fläche, Ergebniskarte, `ZonePreview` rechts (`grid md:grid-cols-[1fr_180px]`), gesteuert über die bestehenden `highlight`/`onSelect`-Props.
- `werbung.tsx`: `PartnerAreaPicker` an die Stelle der Dauerliste; `PartnerPackages` bleibt hinter einem Collapsible „Alle Flächen anzeigen".
- Nur Präsentationsschicht: `partner-packages.ts`, Preislogik, Anfrageformular und Mailversand bleiben unangetastet.
