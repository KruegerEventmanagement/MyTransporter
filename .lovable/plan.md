## Ziel

Startseite wieder reduziert wie früher: nur Hero "Buche deinen Transporter" mit den 5 Schritten und Buchungspanel. Marketing-Inhalte wandern auf eine neue Seite "Über uns". Buchung nutzt progressive Offenlegung (Datum → Uhrzeit → Tarif). Mittelstriche werden aus allen Texten entfernt.

## 1. Startseite reduzieren (`src/routes/index.tsx`)

Entfernen: `TariffSection`, `AdvantagesSection`, `CompareSection`, `BookingInfoSection`.
Bleibt: `Navbar`, `HeroSection`, `BookingSection`, Footer.
Footer: neuen Link "Über uns" neben FAQ / Partner einfügen.

## 2. Neue Seite `src/routes/ueber-uns.tsx`

Komponiert die vier verschobenen Sektionen: Tariftabelle (Mehrtagestarife + Einzeltage), Vorteile (L4H2, faire km, gepflegtes Fahrzeug), Vergleich (faire km-Pakete), "Gut zu wissen" (Kaution, Führerschein, Tanken, Auslandsfahrten etc.). Eigene head() mit eigenem Title / Description / og-Tags. H1 "Über MyTransporter".

## 3. Buchungsflow Schritt 1 umbauen (`src/components/BookingSection.tsx`)

Schritt 1 erhält drei Unterphasen mit progressiver Anzeige:

```text
1a) Kalender (Range)
    → Nutzer wählt von/bis (Doppelklick = 1 Tag)
    → Button "Weiter" aktiv sobald range vollständig
1b) Startzeit
    → wird erst sichtbar nachdem Range bestätigt wurde
    → blendet je nach rangeDays nur erlaubte Stunden ein
1c) Tarifkarten
    → werden erst sichtbar nachdem Startzeit gewählt wurde
    → nur Tarife passend zu rangeDays + Startzeitregeln
```

Konkret: neuer lokaler State `rangeConfirmed: boolean`. Wechsel-Logik:
- Button "Weiter zu Uhrzeit" erscheint unter dem Kalender wenn `range.from && range.to`.
- Klick setzt `rangeConfirmed = true`, blendet Uhrzeit-Grid ein.
- Klick auf Stunde setzt `startHour`, blendet Tarifkarten ein.
- Bisheriger globaler "Weiter"-Button bleibt für den Sprung Schritt 1 → Schritt 2 (Fahrzeug), aktiv sobald `selectedPlanId` gesetzt.

## 4. Tarif- und Uhrzeitlogik

Späteste Rückgabe = 22:00. Daraus ergeben sich Startzeitfenster pro Tarif:

| Tarif | Dauer | spätester Start |
|---|---|---|
| 3h Express | 3 h | 19:00 |
| 6h Mini | 6 h | 16:00 |
| 24h Umzugstag / Langstrecke | 24 h | 20:00 (Rückgabe nächster Tag bis 22:00) |
| 2–7 Tage | n×24 h | 20:00 |

Mehrtage:
- `rangeDays == 1` → nur Einzeltagestarife (Express, Mini, Umzugstag, Langstrecke), gefiltert nach `startHour`.
- `rangeDays` 2…7 → nur der passende Mehrtagestarif (z. B. 3 Tage → 3-Tage-Umzug+).
- `rangeDays > 7` → automatisch n×7-Tage-Wochentarif: `pakete = ceil(rangeDays / 7)`, Anzeige z. B. "2× Wochentarif (14 Tage) = 898 €". Restwoche < 7 wird auf vollen Wochentarif aufgerundet. Eine Karte, ein Plan-ID-Schema `rent_week_x{n}`.

Logik dafür in `src/lib/booking-rules.ts`:
- Neue Hilfsfunktion `getAvailablePlans(rangeDays, startHour)` → Array von Tarifen mit ggf. dynamisch berechnetem Wochenpaket-Eintrag (Multiplikator + Gesamtpreis + km).
- `computePlanReturn` erweitern: bei Wochenpaket `durationHours = pakete * 7 * 24`.
- `isStartHourAllowed` bleibt; für Wochenpakete gilt Regel der 24h-Tarife (≤ 20:00).

Schritt 2 ("Tarif wählen") bleibt im Stepper, dient nur als Bestätigung der in Schritt 1c getroffenen Auswahl bzw. wird übersprungen (Stepper-Anzeige zeigt direkt Fahrzeug). Empfehlung: Stepper-Titel "Tarif wählen" entfällt, da Tarif schon in 1c gewählt; Stepper hat dann 4 Schritte (Datum & Tarif, Fahrzeug, Bezahlen, Fahrt) bzw. 5 mit Registrierung. Damit ist die Reihenfolge: Datum → Uhrzeit → Tarif (alles in einem Step) → Weiter → Fahrzeug.

## 5. Mittelstriche entfernen

Alle Vorkommen von `–` (en dash) und `—` (em dash) in `src/**` durch normalen Bindestrich `-` oder Komma ersetzen, je nach Kontext. Ausgenommen Code (z. B. Kommentare unkritisch, aber wir machen es einheitlich). Betroffene Komponenten v. a. `HeroSection`, `BookingSection`, neue Seite, Promotexte, Tarifbeschreibungen in `PLAN_CATALOG`, `partner-packages.ts`.

## 6. Navbar

`src/components/Navbar.tsx`: "Über uns" als Link aufnehmen (Desktop + Mobile Menü).

## Technische Details

- Geänderte Dateien: `src/routes/index.tsx`, `src/routes/ueber-uns.tsx` (neu), `src/components/BookingSection.tsx`, `src/components/Navbar.tsx`, `src/lib/booking-rules.ts`, ggf. `src/lib/payments.functions.ts` und `src/routes/checkout.return.tsx` für neue Wochenpaket-Plan-IDs (`rent_week_xN`).
- Komponenten `TariffSection`, `AdvantagesSection`, `CompareSection`, `BookingInfoSection` bleiben erhalten, werden nur auf der neuen Seite eingebunden.
- TanStack-Routing: neue Route-Datei erzeugt Eintrag automatisch in `routeTree.gen.ts`.
- Keine DB-Änderungen.
