## Ziel
Im Buchungs-Kalender (`src/components/BookingSection.tsx`, Step 0) alle Tage von heute bis einschließlich 07.09.2026 als nicht buchbar sperren und optisch mit einem roten X kennzeichnen.

## Änderungen

**`src/components/BookingSection.tsx`**
1. Konstante `UNAVAILABLE_UNTIL = new Date("2026-09-07")` (inkl. dieses Tages gesperrt, ab 08.09.2026 wieder buchbar).
2. `disabled`-Funktion des `<Calendar>` erweitern: zusätzlich `true` zurückgeben, wenn `d <= UNAVAILABLE_UNTIL`.
3. `modifiers={{ unavailable: (d) => d <= UNAVAILABLE_UNTIL && d >= today }}` und `modifiersClassNames={{ unavailable: "relative text-destructive line-through" }}` ergänzen, plus eine kleine CSS-Overlay-Klasse (rotes ✕) via `modifiersClassNames` mit Tailwind (`after:content-['✕'] after:absolute after:inset-0 after:flex after:items-center after:justify-center after:text-destructive after:font-bold`) – so erscheint über jedem gesperrten Tag ein rotes X.
4. Kurze Hinweiszeile über/unter dem Kalender: „Alle Fahrzeuge bis 07.09.2026 ausgebucht – ab 08.09.2026 wieder verfügbar."

Kein Backend-/Logik-Eingriff, reine Frontend-Anzeige, konsistent mit dem bestehenden `AvailabilityNotice`-Overlay.
