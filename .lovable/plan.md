## Ziel
Paragraph 4 „Preise und Tarife“ auf der AGB-Seite (`src/routes/agb.tsx`) mit den aktuellen Miettarifen und Zusatzpaketen aus dem Code abgleichen und überschreiben.

## Aktuelle Datenlage (aus dem Code)
Die zentrale Tarifquelle ist `src/lib/booking-rules.ts` (`PLAN_CATALOG`):

| Tarif | Preis | Freikilometer | Mehrkilometer |
| --- | --- | --- | --- |
| 3 Stunden Express | 39 € | 100 km | 0,39 €/km |
| 6 Stunden Umzug Mini | 59 € | 200 km | 0,39 €/km |
| 24 Stunden Umzugstag | 89 € | 300 km | 0,39 €/km |
| 24 Stunden Langstrecke | 119 € | 500 km | 0,39 €/km |
| 2 Tage Kurzprojekt | 159 € | 600 km | 0,35 €/km |
| 3 Tage Umzug Plus | 219 € | 900 km | 0,35 €/km |
| 4 Tage Renovierungs-Tarif | 289 € | 1.100 km | 0,35 €/km |
| 5 Tage Projektwoche Mini | 349 € | 1.300 km | 0,35 €/km |
| 6 Tage Projektwoche | 399 € | 1.400 km | 0,35 €/km |
| 7 Tage Wochenmiete | 449 € | 1.500 km | 0,29 €/km |
| Reiner Kilometer-Tarif | 0,90 €/km | – | Mindestbetrag 100 € |

Zusatzpakete aus `src/lib/addons.ts`:
- Sicher-Transport Paket: 19 €
- Profi-Umzug Paket: 49 €

Kaution: 200 € (bleibt unverändert in § 3).

## Vorgehen
1. In `src/routes/agb.tsx` den bisherigen § 4 „Preise und Tarife“ (Zeilen 50–57) ersetzen durch eine aktuelle Liste mit den Tarifen, Freikilometern und Mehrkilometerpreisen.
2. Optional Zusatzpakete und den reinen Kilometer-Tarif als separate Unterpunkte ergänzen, damit die AGB vollständig alle aktuellen Preisbestandteile abbildet.
3. Formulierung juristisch neutral halten („Preise verstehen sich pro Mietvorgang, inklusive der angegebenen Freikilometer, zzgl. 19 % MwSt.“, falls anwendbar) und Rückgaberegeln aus dem Tarifkatalog übernehmen.
4. Abschließend im Preview die AGB-Seite kurz visuell prüfen.

## Ausgeschlossen (kann separat angegangen werden)
- Änderungen an FAQ, Startseite oder anderen Marketingtexten, obwohl dort teilweise ebenfalls noch die alten Preise (100 €/150 €) stehen.
- Technische Tariflogik in `booking-rules.ts` bleibt unverändert.