# VW Crafter OF-DK 1234: Daten aus dem Fahrzeugschein übernehmen

## Was der Fahrzeugschein belegt (Zulassungsbescheinigung Teil I, ausgestellt 17.05.2023)

| Feld | Wert |
|---|---|
| A Kennzeichen | OF DK 1234 (passt zum Fahrzeug in der Datenbank) |
| B Erstzulassung | 25.11.2011 |
| D.3 / 2 / 5 | VW Crafter, Fz. z. Güterbef. bis 3,5 t, Van |
| P.1 / P.2 / P.3 | 1968 cm³, 120 kW bei 3600/min, Diesel |
| T Höchstgeschwindigkeit | 160 km/h |
| 18 / 19 / 20 Außenmaße | Länge 6945 mm, Breite 1993 mm, Höhe 2725 mm |
| G Leergewicht | 2186–2355 kg (je nach Ausstattung) |
| F.1 zulässige Gesamtmasse | 3500 kg |
| O.1 / O.2 Anhängelast | 2000 kg gebremst / 750 kg ungebremst, Stützlast 100 kg |
| S.1 Sitzplätze | 2 |
| 15.1 / 15.2 Reifen | 235/65 R16C 115/113R |
| L Achsen | 2 |

Die Fahrgestellnummer (VIN) sowie Halter-Name und -Anschrift werden weder angezeigt noch öffentlich gespeichert.

## Karosserie-Zuordnung

Mit 6945 mm Länge und 2725 mm Höhe ist das ein **Crafter mit langem Radstand (ohne Überhang), Hochdach** – also NICHT „lang maxi“ (7340 mm) und NICHT Superhochdach. Deshalb gelten die bisher genannten Maxi-Werte (4700 mm Ladelänge / 15,5 m³) für dieses Fahrzeug nicht.

Innenmaße stehen nicht im Fahrzeugschein. Sie werden aus dem VW-Prospekt 2013 (Seite 31) für die passende Variante „lang, Hochdach“ übernommen – vor dem Eintragen lese ich die Werte dort nochmals ab (erwartet: Ladelänge ca. 4300 mm, Breite 1780 mm, zwischen Radkästen 1350 mm, Innenhöhe 1940 mm, Hecktür 1565 × 1840 mm, Schiebetür 1300 × 1820 mm, Volumen ca. 14 m³). Nur tatsächlich abgelesene Werte werden gespeichert.

Anzeige wie bei den Citroën: „Werksmaße der Modellvariante; Innenverkleidung/Ausbau können nutzbare Maße verringern. Bei passgenauer Ladung bitte nachmessen.“

## Nutzlast

Nicht direkt im Schein. Rechnung: 3500 kg − Leergewicht 2186–2355 kg = **ca. 1145–1314 kg**. Angezeigt wird die vorsichtige Angabe „ca. 1.145 kg“ (untere Grenze), mit Hinweis „rechnerisch aus Fahrzeugschein“. Der bisherige Wert 3000 kg wird ersetzt (er war falsch).

## Was sich ändert

- Crafter-Datensatz: Erstzulassung, Motor, Außenmaße, Gewichte, Anhängelast, Reifen, Sitze, Innenmaße aus Prospekt, Nutzlast, Quelle „Fahrzeugschein + VW Crafter Prospekt 2013 (lang, Hochdach)“, Status „bestätigt“ statt „noch nicht bestätigt“.
- Anzeigename: „VW Crafter lang Hochdach“ (statt „VW Crafter L5H2“). Die Preisklasse L5H2 bleibt unverändert – keine Preisänderung.
- Die Sperre „noch nicht bestätigt“ für den Crafter wird aufgehoben, damit die Werte sichtbar sind.
- Unverändert: Fotos, Kennzeichen, Aktivstatus, Abholort Poststraße 60 Leonberg, Buchungen, Preise, andere Fahrzeuge.
- Das Foto des Fahrzeugscheins wird NICHT in den öffentlichen Fahrzeug-Speicher gelegt (enthält Halterdaten). Der alte falsche Dokument-Verweis bleibt, bis Sie entscheiden.
- Tankgröße/Reichweite: stehen nicht im Schein, bleiben leer.

## Technische Details

- Daten-Update der Zeile vehicles (plate OF-DK 1234) per SQL; alter Stand wird vorher dokumentiert.
- vehicle-facts.ts: Crafter-Einträge aus UNCONFIRMED_SPECS entfernen; Hinweistext für specs_status 'werksangabe_modellvariante' wiederverwenden; Nutzlast-Hinweis ergänzen.
- Tests anpassen (Crafter jetzt bestätigt, keine VIN/Halterdaten in der Anzeige), Tests/Typecheck/Build laufen lassen. Nicht veröffentlichen.
