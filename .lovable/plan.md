# Langzeitmiete: Badge und Strecken-Regler entfernen

## Was sich ändert (nur Anzeige, keine Logik)

Auf der Seite `/langzeitmiete` (`src/routes/langzeitmiete.tsx`) werden zwei rein dekorative Elemente entfernt:

1. **Badge über der Überschrift** — die Pill mit dem Sparkles-Icon und Text „Ab 7 Tagen automatisch günstiger" (Z. 56–59).
2. **Strecken-Regler zwischen Start und Rückgabe** — der gesamte Block mit Start/Rückgabe-Beschriftung, RouteIcon, „X Miettage"-Text und der Fortschrittsanzeige (Z. 127–143), inkl. der `progress`-Variable, die nur dort verwendet wird.

Keine Änderung an Preislogik, Eingabefeldern, Ergebnisbereich oder Tests. Der `progress`-Wert wird nach Entfernung nicht mehr referenziert und kann mit entfernt werden.

## Technische Schritte

- `src/routes/langzeitmiete.tsx`:
  - Badge-Pill (Sparkles + Text) über dem `<h1>` löschen.
  - Block „Strecke Start → Rückgabe" mit Progressbar löschen.
  - `progress`-Zeile (`const progress = …`) löschen, da danach ungenutzt.
  - `RouteIcon` wird nur im entfernten Regler verwendet → Import entfernen. `Sparkles` bleibt (wird unten in den Feature-Karten weiter genutzt).

## Prüfung

- Typecheck (`bunx tsgo --noEmit`) grün.
- Build grün.
- Bestehende Tests unverändert grün.
