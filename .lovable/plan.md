# Buchung: Datumsbereich-Picker + neue Tarifstruktur

## Was sich ändert

### 1. Buchungsablauf (Schritt 1 „Datum & Uhrzeit")

Statt **ein Datum + Uhrzeit** wählt der Kunde jetzt wie bei einer Urlaubsbuchung **einen Datumsbereich**:

- Erster Klick = Startdatum, zweiter Klick = Enddatum.
- Eintägige Buchung: zweimal auf den gleichen Tag klicken (z. B. 15. → 15.).
- Mehrtägige Buchung: 15. → 18. = 4 Tage in einem Rutsch.
- Erst **danach** wird die Startuhrzeit gewählt (Rückgabezeit ergibt sich automatisch aus dem Tarif, bleibt wie bisher).
- Belegte Tage und vergangene Tage bleiben deaktiviert. Ein Bereich, der einen belegten Tag enthält, ist nicht auswählbar.

### 2. Neue Tarifstruktur (Schritt 2)

Tarife werden basierend auf der Tagesanzahl gefiltert.

**Eintagestarife** (Start = Ende):

| Tarif | Preis | Inklusive | Dauer |
|---|---|---|---|
| 3 h Express | 39 € | 100 km | 3 Stunden |
| 6 h Umzug Mini | 59 € | 200 km | 6 Stunden |
| 24 h Umzugstag ★ Beliebtester Tarif | 89 € | 300 km | 24 Stunden |
| 24 h Langstrecke ★ Bester Kilometer-Deal | 119 € | 500 km | 24 Stunden |

**Mehrtagestarife** (passend zur gewählten Tagesanzahl):

| Tage | Tarif | Preis | Inklusive | Tagespreis |
|---|---|---|---|---|
| 2 | Kurzprojekt | 159 € | 600 km | 79,50 €/Tag |
| 3 | Umzug Plus ★ Beliebt für Umzüge | 219 € | 900 km | 73,00 €/Tag |
| 4 | Renovierungs-Tarif | 289 € | 1.100 km | 72,25 €/Tag |
| 5 | Projektwoche Mini | 349 € | 1.300 km | 69,80 €/Tag |
| 6 | Projektwoche | 399 € | 1.400 km | 66,50 €/Tag |
| 7 | Wochenmiete ★ Bester Tagespreis | 449 € | 1.500 km | 64,14 €/Tag |

Mehrkilometer: 0,39 € (Eintagestarife), 0,35 € (2–6 Tage), 0,29 € (Wochenmiete). Kaution 200 € bleibt.

Bei mehr als 7 Tagen: Hinweis „Bitte kontaktiere uns für längere Mieten".

### 3. Neue Sektion auf der Startseite: „Großer L4H2-Transporter zum fairen Preis"

Unter dem Hero / über der Buchung wird ein neuer Tarifbereich eingebaut:

- **Überschrift**: „Großer L4H2-Transporter zum fairen Preis"
- **Unterüberschrift**: „Mehr Platz, faire Kilometer und transparente Preise – perfekt für Umzug, Möbeltransport, Entrümpelung und Großeinkäufe."
- **4 Eintagestarif-Karten** mit Highlights für „Beliebtester Tarif" (89 €) und „Bester Kilometer-Deal" (119 €).
- **Mehrtagestarife** als kompakte, aufklappbare Liste/Tabelle mit Tagespreis-Spalte, Hervorhebung 3 Tage („Beliebt für Umzüge") und 7 Tage („Bester Tagespreis").
- Jeder Tarif bekommt einen Button „Verfügbarkeit prüfen" → scrollt zum Buchungsbereich.

### 4. Neue Sektion „Warum MyTransporter?"

Vorteilsbereich mit Punkten: L4H2 lang & hoch · viel Ladevolumen · 300/500 km inklusive · sauber aufbereitet · neue Bremsen/Reifen/Federn · zuverlässig · ideal für Leonberg, Stuttgart und Umgebung. Ehrlich-positive Formulierung („nicht neu, aber technisch gepflegt").

### 5. Neue Sektion „Fair vergleichen"

Kurzer Vergleichshinweis (keine Konkurrenz-Namen): „Viele Anbieter wirken im Grundpreis günstig, haben aber oft nur wenige Kilometer inklusive. Bei MyTransporter bekommst du einen großen L4H2-Transporter mit fairen Kilometerpaketen."

### 6. Neue Sektion „Gut zu wissen"

Hinweisbereich: Kaution nach Absprache · Führerschein & Ausweis · Übergabe mit Fotos und Protokoll · vollgetankt zurück · besenrein · Rauchen verboten · Auslandsfahrten nur nach Absprache · Baustoffe nur mit Schutzplane.

## Technische Details

- **`src/lib/booking-rules.ts`**: Neue `PLAN_CATALOG`-Konstante mit allen 10 Tarifen (4 Eintages, 6 Mehrtages). `computePlanReturn` erweitert: Mehrtagestarife = Start + n×24 h. `isStartHourAllowed` berücksichtigt nur 3h/6h-Endzeit-Begrenzung.
- **`src/components/BookingSection.tsx`**:
  - `date: Date | undefined` → `range: { from?: Date; to?: Date }`, `Calendar mode="range"`.
  - `disabled` blockt Bereiche, die einen belegten Tag enthalten (mit `slotsForVehicle` prüfen).
  - Tarif-Filterung nach `tageAnzahl = differenceInCalendarDays(to, from) + 1`.
  - Startuhrzeit-Auswahl bleibt im selben Step nach Datumsbereich-Wahl sichtbar.
  - Preisberechnung + Rückgabe-Anzeige auf neue Tarife umstellen.
  - `AUTH_BOOKING_DRAFT_KEY` speichert jetzt `{from, to, startHour, selectedPlan}`.
- **Neue Komponente `src/components/TariffSection.tsx`**: Tarif-Übersicht für die Landingpage (Eintages-Karten + Mehrtages-Tabelle).
- **Neue Komponenten `AdvantagesSection.tsx`, `CompareSection.tsx`, `BookingInfoSection.tsx`**: kleine, statische Inhalts-Sektionen im monochromen Stil.
- **`src/routes/index.tsx`**: Neue Sektionen unter dem Hero einbauen.
- **`src/lib/payments.functions.ts` / Checkout**: Preisbetrag wird im Buchungsdraft mitgegeben, daher passt der bestehende Mechanismus, sobald `selectedPlan` die neuen Preise liefert. Plan-Keys werden auf `rent_3h | rent_6h | rent_24h_short | rent_24h_long | rent_multi_{n}d` erweitert (Mapping in `BookingSection`).
- **`booking-emails.functions.ts` / Trip-Anzeigen**: Tarif-Labels werden aus `PLAN_CATALOG` gelesen, keine hartkodierten Strings mehr.

## Was nicht geändert wird

- Belegt-Slot-Logik, Auth-Flow, Stripe-Checkout-Mechanik, PreDrive/ActiveDrive/Return-Komponenten.
- Design bleibt strikt monochrom (Schwarz/Weiß/Grau, Fredoka), keine neuen Farben.
