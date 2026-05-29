Ich setze die Werbeflächen jetzt nicht mehr als grobe Rechtecke, sondern als ein echtes Sponsoren-Raster nach dem Referenzbild um.

## Zielbild
- Oben über dem Fenster / Hochdach: mehrere kleine, schmale Werbefelder nebeneinander.
- Darunter: große Hauptflächen für teurere Werbung.
- Darunter: ein schmaler horizontaler Balken mit kleineren Werbeflächen.
- Unten: weitere Flächen nur dort, wo wirklich weiße Karosserie ist.
- Keine Flächen auf Reifen, Radhaus, Scheinwerfern, Fenstern, schwarzem Plastik oder Stoßfängern.
- Formen dürfen Polygone sein: abgerundete/angeschnittene Türbereiche, Radhaus-Ausschnitte, schräge Dach-/Frontkanten.

## Umsetzung
1. `src/lib/partner-zones.ts` wird erneut überarbeitet:
   - Seitenansichten bekommen ein dichtes Raster wie im Referenzbild.
   - Fahrer-/Beifahrerseite werden logisch gespiegelt.
   - Die großen Flächen werden in Hauptflächen, schmale Zwischenbalken und untere Karosserie-Flächen aufgeteilt.
   - Tür- und Radhausbereiche bekommen mehrpunktige Polygonformen statt starrer Vierecke.

2. `src/components/partner/TransporterPhotoDiagram.tsx` wird visuell angepasst:
   - Keine Beispiel-Werbung mehr beim Anklicken, sondern klar sichtbare weiße transparente Flächen.
   - Alle Flächen bleiben sichtbar genug, damit man Größe und spätere Wirkung erkennt.
   - Ausgewählte Fläche: ca. 40% weiß transparent mit kräftiger schwarzer Kontur.
   - Nicht ausgewählte Fläche: dezenter, aber weiterhin sichtbar.

3. Paket-/Preislogik bleibt bestehen:
   - Preise werden weiter automatisch aus der Polygonfläche berechnet.
   - Durch die neuen Flächengrößen ändern sich die Preise automatisch passend.

4. Text/Legende wird minimal angepasst:
   - Der Hinweis soll nicht mehr sagen, dass ein Beispiel-Motiv eingeblendet wird, wenn das entfernt wird.

## Ergebnis
Die Darstellung soll deutlich näher an deinem Referenzbild sein: ein echtes, dichtes Werberaster auf der Karosserie mit kleinen, mittleren und großen Sponsorenflächen – sauber an Fahrzeugform und Blechbereiche angepasst.