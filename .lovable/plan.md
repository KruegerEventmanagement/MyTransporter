## Problem

Aktuell wird `rangeDays = differenceInCalendarDays(to, from) + 1` berechnet. Wenn der Nutzer vom 15. bis 16. klickt (1 Nacht), springt die Logik sofort auf 2 Tage und zeigt nur den „2 Tage Kurzprojekt" Tarif. Richtig wäre: 1 Nacht = 1 Tag (24h Tarif), 2 Nächte = 2 Tage, usw. Ein Klick auf denselben Tag (0 Nächte) = Tagesmiete unter 24h (3h/6h).

## Änderungen

### 1. `src/lib/booking-rules.ts` – `getAvailablePlans(nights, startHour)`

Parameter umbenennen von `rangeDays` zu `nights` und Mapping anpassen:

- `nights === 0` (selber Tag): nur Eintagestarife mit `durationHours < 24` → 3h Express, 6h Mini
- `nights === 1` (eine Nacht): nur 24h-Tarife (`days === 1 && durationHours === 24`) → 24h Umzugstag, 24h Langstrecke
- `nights >= 2 && nights <= 7`: `days === nights` (bestehende Mehrtagestarife)
- `nights >= 8`: Wochenpaket `week_x{ceil(nights/7)}`

Startzeit-Filter (`isStartHourAllowed`) bleibt unverändert – kürzere Tarife brauchen weiterhin früheren Start (Rückgabe ≤ 22:00).

### 2. `src/components/BookingSection.tsx`

- `rangeDays` neu berechnen als `nights = differenceInCalendarDays(rangeTo, rangeFrom)` (ohne `+1`). Variable bleibt im UI als „Tage" benannt, aber semantisch = Nächte.
- `canProceedStep0`: weiterhin verlangen, dass beide `from` und `to` gesetzt sind (Doppelklick auf denselben Tag setzt `to=from`, 0 Nächte = Tagesmiete).
- Aufruf `getAvailablePlans(nights, startHour)` mit der neuen Semantik.
- Anzeige im Datumsschritt anpassen:
  - 0 Nächte → „Tagesmiete (3h/6h Tarife)"
  - 1 Nacht → „1 Tag (1 Nacht)"
  - 2+ Nächte → „N Tage (N Nächte)"
- Anzeige im Uhrzeit-Schritt analog (`rangeDays > 1` Hinweis ergänzen).
- Hinweistext beim Range-Picker aktualisieren: „für Tagesmiete: erneut auf denselben Tag klicken, für 1 Tag mit Übernachtung: Folgetag klicken".

### 3. Hinweis im UI für die 24h-Logik

Im Tarifschritt unter den Tarifkarten kurzen Hinweis ergänzen wenn `nights === 1`: „Rückgabe am Folgetag zur gleichen Uhrzeit. Für längere Mietdauer bitte mehr Tage im Kalender wählen." Damit ist klar: wer Mo 8 Uhr holt und Di 16 Uhr zurück will, muss 2 Nächte (Mo→Mi) wählen und bekommt den 2-Tage-Tarif.

### 4. `busyDateSet` / Overlap-Check

Bleibt unverändert – arbeitet schon korrekt mit kalendarischen Tagen.

## Geänderte Dateien

- `src/lib/booking-rules.ts` (getAvailablePlans Mapping)
- `src/components/BookingSection.tsx` (rangeDays Berechnung, UI Texte)

Keine Änderungen an Tarifkatalog, Preisen, Checkout oder anderen Komponenten.