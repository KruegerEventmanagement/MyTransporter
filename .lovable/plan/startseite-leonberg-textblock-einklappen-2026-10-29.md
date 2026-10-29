# Startseite: Leonberg-Textblock einklappen

## Ziel
Der Abschnitt „Transporter mieten in Leonberg“ auf der Startseite soll nicht mehr als langer Textblock sichtbar sein, für Google aber vollständig erhalten bleiben.

## Umsetzung
- Der Block wird standardmäßig eingeklappt. Sichtbar bleibt nur eine schmale, dezente Zeile „Mehr über MyTransporter in Leonberg“ mit kleinem Pfeil.
- Ein Klick klappt den bisherigen Text samt Preisliste und Links auf.
- Der gesamte Text bleibt im Seiteninhalt, sodass Google ihn liest. Er wird nicht komplett unsichtbar gemacht, weil Google komplett verstecktes Textmaterial als Täuschung werten und die Seite abstrafen kann. Eingeklappte Bereiche dagegen sind laut Google ausdrücklich erlaubt.
- Die Hauptüberschrift für Google bleibt erhalten, nur optisch klein in der Klappzeile.
- Seitentitel und Suchbeschreibung bleiben unverändert.

## Technische Details
- `src/components/HomeIntroSection.tsx`: Inhalt in ein natives `<details>`/`<summary>` packen (ohne JS, SSR-fest), `h1` im `summary`, kleinerer Abstand (`py-4` statt `py-12`), monochrome Tokens; im Halloween-Zeitraum keine Sonderbehandlung nötig.
- Übersetzungen der Klappzeile über `src/lib/i18n` (Deutsch als Quelle).
