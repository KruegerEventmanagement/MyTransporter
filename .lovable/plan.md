# Kilometer neu ordnen und Spalte „pro Tag“ entfernen

## Wer hat das geändert?
Die 480 km kamen am 06.10.2026 aus einem Auftrag von dir („20 km pro Mietstunde, 24 h = 480 km“). Am 04.10.2026 galten **dieselben Preise wie heute**, nur andere Kilometer (3 h 67, 6 h 133, 24 h 200 km). Die Preise bleiben also auf dem Stand vom 04.10. Bei den Kilometern gelten deine neuen Vorgaben von heute.

## Neue Tarife (kurzer Transporter L1H1)

| Tarif | Preis | inkl. km |
|---|---|---|
| 3 Stunden Express | 49 € | 70 |
| 6 Stunden Umzug Mini | 69 € | 100 |
| 24 Stunden Umzugstag | 99 € | 150 |
| 24 Stunden Langstrecke (**neu**) | 139 € | 300 |
| 24 Stunden Weitstrecke | 189 € | 500 |
| 24 Stunden Fernstrecke | 299 € | 800 |
| 2 Tage | 189 € | 200 |
| 3 Tage | 269 € | 300 |
| 4 Tage | 339 € | 400 |
| 5 Tage | 399 € | 500 |
| 6 Tage | 449 € | 600 |
| 7 Tage Wochenmiete | 499 € | 700 |
| mehrere Wochen | je Woche 499 € | je Woche 700 |

- Langer Transporter weiter +10 € pro Miettag, Crafter wie bisher (z. B. Langstrecke 300 km: 149 € / 165 €).
- Mehrkilometer weiter 0,45 €/km, Kaution 200 €. Die Langzeitmiete bleibt unverändert.
- Jedes größere Paket ist günstiger als Mehrkilometer nachzuzahlen (z. B. 99 € + 150 km × 0,45 € = 166,50 € gegenüber 139 €).

## Was sich auf der Seite ändert
- Die Spalte **„pro Tag“** in der Mehrtages-Tabelle ist weg, ebenso der Hinweis „≈ … € pro Tag“ in der Buchung.
- Startseite, Preise, Buchung, Tarifkarten, FAQ, AGB und Vorteile zeigen überall dieselben neuen Kilometer.
- Bereits gebuchte Fahrten behalten genau die Kilometer, die bei der Buchung bestätigt wurden. Wer die Seite noch mit den alten Werten offen hat, wird beim Bezahlen zum Neuladen aufgefordert.

## Technische Details
- `src/lib/booking-rules.ts`: freeKm der Vorlagen anpassen; neuen Eintrag `24h_300km` (139 € / L4H2 149 €, 300 km) zwischen `24h_300` und `24h_500` einfügen; `24h_500` Label „24 Stunden Weitstrecke“; shortLabels („24 h · 150 km“ usw.); Kommentar zur Preis-Invariante aktualisieren. Bestehende IDs bleiben (24h_300 = Umzugstag), damit alte Buchungen/Sessions gültig sind.
- `KM_CATALOG_VERSION` → `km-2026-10-08`; `km-2026-10-06` in `PREVIOUS_KM_CATALOG_VERSIONS` aufnehmen, damit offene Sessions ihren Snapshot behalten. LEGACY_FREE_KM unverändert.
- `getAvailablePlans`: 1 Nacht liefert automatisch alle vier 24-h-Tarife. Prüfen, dass Wizard, `rental-quote.ts`, `custom-km.ts`, Preis-Seite (`LONG`-Liste um neuen Tarif ergänzen) und Schema-Daten korrekt mitziehen.
- `TariffSection.tsx`: Spalte „pro Tag“ samt `perDay` entfernen. `BookingSection.tsx`: Zeile „≈ … pro Tag“ entfernen. `LongTermPlanner` bleibt.
- Feste Texte in FAQ, AGB-Tarifliste (Stand 08.10.2026), AdvantagesSection, Umzugs-/Pforzheim-Seite auf neue km prüfen.
- Tests: km je Tarif und Klasse (70/100/150/300/500/800, 200–700, week_xN 700·N), Preis 139 € für den neuen Tarif, Invariante „Paket nie teurer als Grundtarif + Mehr-km“, alte Session mit `km-2026-10-06` behält 480 km. Danach komplette Tests, Typecheck, Build, Browsercheck 390 px + Desktop.
- Projektnotiz „Preisstruktur“ mit den neuen Werten aktualisieren. Keine Datenbankänderung, kein Veröffentlichen.
