# Hero-Bereich visuell verbergen (Code bleibt erhalten)

## Ziel
Der komplette Hero-Bereich auf der Startseite (`/`) soll auf der Website nicht mehr sichtbar sein. Der Code der Komponente bleibt unverändert erhalten, nur die Darstellung wird über CSS ausgeblendet.

## Umsetzung
Datei: `src/components/HeroSection.tsx`

Die äußerste `<section>` bekommt die Tailwind-Klasse `hidden` (entspricht `display: none`). Dadurch wird der gesamte Block (Logo-Button, Überschrift, Beschreibung, drei Tarifkarten, Subtext, Buttons, Telefon-Link) visuell entfernt, ohne dass Code oder Logik gelöscht werden.

```tsx
<section className="hidden pt-10 pb-6 px-4">
```

Keine Änderung an:
- `src/routes/index.tsx` (Import und `<HeroSection />` bleiben)
- Buchungs-/Preislogik
- Sonstige Komponenten

## Warum `hidden` und nicht Löschen
- Code bleibt für spätere Wiederverwendung erhalten.
- `display: none` entfernt das Element komplett aus dem Layout (kein Platzhalter, kein Scroll-Bereich).
- Einmalige, leicht rückgängig zu machende Änderung (Klasse entfernen).

## Prüfung
- Typecheck / Build grün.
- Startseite lädt ohne sichtbaren Hero-Block; restlicher Inhalt (Vorteile, Buchungsbereich etc.) bleibt davon unberührt.
