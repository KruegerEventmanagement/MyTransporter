# Fahrzeugbezogene Verfügbarkeit statt Pauschalsperre

## Ziel
Die Warnmeldung "alle Transporter vermietet" und die roten Kreuze verschwinden. Stattdessen entscheidet pro Fahrzeug und pro Uhrzeit, was buchbar ist: Ein Tag ist nur dann komplett gesperrt, wenn *beide* Transporter belegt sind. Ist nur der große weg, kann der kleine gebucht werden – und umgekehrt.

## Was entfernt wird
- Das Start-Popup "Aktuell keine Transporter verfügbar" (inkl. Komponente).
- Die pauschale Kalendersperre bis 07.09.2026, die roten ✕-Markierungen und den roten Hinweistext unter dem Kalender.

## Belegungen, die eingetragen werden
- **Citroen Jumper L4H2 (LEO MY 101)**: gesperrt von jetzt bis Sa. 05.09.2026 09:00 Uhr, danach die Buchung 05.09.2026 09:00 – 06.09.2026 09:00 Uhr. Ab 06.09.2026 09:00 Uhr wieder frei.
- **Citroen Jumper L1H1 (LEO MY 102)**: gesperrt bis Sa. 05.09.2026 09:00 Uhr (ab dann buchbar) sowie 19.09.2026 09:00 – 21.09.2026 09:00 Uhr.
- Die bestehende Kundenbuchung des L4H2 vom 19.–21.09.2026 bleibt unverändert; dadurch sind beide Fahrzeuge in diesem Zeitraum belegt und die Tage im Kalender komplett gesperrt.

## Neue Logik im Buchungsablauf
1. **Kalender**: Ein Tag ist nur gesperrt, wenn für *kein* Fahrzeug an diesem Tag noch etwas möglich ist. Teilweise belegte Tage bleiben wählbar.
2. **Startzeit**: Eine Uhrzeit ist wählbar, solange mindestens ein Fahrzeug zu dieser Zeit frei ist.
3. **Tarif**: Ein Tarif ist wählbar, wenn mindestens ein Fahrzeug den kompletten Zeitraum (Start bis Rückgabe) frei hat. Ist keiner frei, bleibt der Tarif wie bisher deaktiviert mit Hinweis.
4. **Fahrzeugauswahl**: Belegte Fahrzeuge werden ausgegraut, mit Badge "Nicht verfügbar" und Klartext-Hinweis (z. B. "Für 05.09., 15:00–18:00 Uhr bereits vermietet – ab 06.09., 09:00 Uhr wieder verfügbar"). Sie können nicht ausgewählt werden; die Vorauswahl springt automatisch auf ein verfügbares Fahrzeug. Der Weiter-Button ist nur mit verfügbarem Fahrzeug aktiv.
5. **Absicherung bei der Reservierung**: Beim Anlegen der 15-Minuten-Reservierung und vor der Zahlung wird erneut serverseitig geprüft, ob das gewählte Fahrzeug im Zeitraum noch frei ist – sonst klare Fehlermeldung statt Doppelbuchung.

## Technische Umsetzung
- Neue Tabelle `public.vehicle_blocks` (vehicle_id, vehicle_plate, start_at, end_at, reason) für Sperren ohne Kundenbuchung, lesbar für anon/authenticated, schreibbar nur für Admins. Die oben genannten Sperren werden als Zeilen eingefügt.
- `src/lib/availability.functions.ts`: `getBusySlots` liefert zusätzlich die Sperren aus `vehicle_blocks` (weiterhin anonymisiert: nur Kennzeichen + Start/Ende). Buchungen ohne Kennzeichen werden künftig dem Fahrzeug per `vehicle_name`/Kennzeichen zugeordnet, damit nicht alle Fahrzeuge blockiert werden.
- Neues Hilfsmodul `src/lib/availability-logic.ts` mit reinen Funktionen: `isVehicleFree(plate, startMs, endMs)`, `freeVehiclesFor(...)`, `nextFreeFrom(plate, startMs)` sowie Tages-Aggregation über alle Fahrzeuge. Nutzung in `BookingSection.tsx` für Kalender-, Stunden-, Tarif- und Fahrzeug-Status.
- `BookingSection.tsx`: `busyDateSet`/`isHourBusy`/`isPlanBlocked` von "aktuelles Fahrzeug" auf "irgendein Fahrzeug frei" umgestellt; Fahrzeugkarte in Step 2 erhält Disabled-Zustand (Graustufen, reduzierte Deckkraft, Hinweistext) und Auto-Auswahl.
- Neue Serverprüfung in `booking-holds.functions.ts` (und im Checkout-Pfad): Überschneidung mit `bookings` + `vehicle_blocks` für das gewählte Kennzeichen → Abbruch mit deutscher Fehlermeldung.
- `src/routes/index.tsx`: `AvailabilityNotice` entfernen, Datei löschen.
