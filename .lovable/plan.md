# 24-Stunden-Tarife bei der Tagesmiete wieder anzeigen

## Ursache (geprüft)
Bei „Tagesmiete (3 h bis 24 h)“ zählt ein einzelner angeklickter Tag als „selber Tag“. Für diesen Fall gibt die Tariflogik nur Tarife unter 24 Stunden zurück, also nur 3 h und 6 h. Die 24-h-Tarife erscheinen nur, wenn im Modus „Mehrere Tage“ zwei aufeinanderfolgende Tage gewählt werden. Der Hinweis „24 Stunden wählst du im nächsten Schritt“ stimmt deshalb aktuell nicht.

## Änderung
1. **Ein Tag angeklickt = alle Tagestarife sichtbar:** 3 h, 6 h und alle vier 24-h-Tarife (150 / 300 / 500 / 800 km). Bei 24 h ist die Rückgabe automatisch am Folgetag zur gleichen Uhrzeit.
2. **24 h ist vorausgewählt:** Sobald die Startzeit feststeht, ist „24 Stunden Umzugstag“ schon markiert. Ist er belegt, wird nichts vorausgewählt. Wechseln auf 3 h, 6 h oder ein anderes 24-h-Paket geht mit einem Klick.
3. **Die Zeitraum-Anzeige stimmt:** Wird 24 h gewählt, steht dort „bis [Folgetag], [Uhrzeit]“ statt „Tagesmiete (3h/6h)“.
4. **Zwei aufeinanderfolgende Tage im Modus „Mehrere Tage“** zeigen weiterhin die 24-h-Tarife. Das prüfe ich im Browser, weil du gesagt hast, dass es auch dort nicht ging.

Unverändert bleiben: Preise, Verfügbarkeitsprüfung pro Fahrzeug, der Schutz vor Doppelbuchungen, die Crafter-Mindestdauer von 5 Tagen und Mehrtagestarife.

## Technische Details
- `getAvailablePlans` in `src/lib/booking-rules.ts`: Bei `nights === 0` wird `p.days === 1` geliefert (statt nur `< 24h`). Der Startzeit-Filter `isStartHourAllowed` bleibt bestehen.
- Belegung: `windowFor(plan.id, startHour)` rechnet bereits mit der Tarifdauer. Ein 24-h-Fenster prüft deshalb den Folgetag schon pro Fahrzeug. Vor der Umsetzung prüfe ich, ob die Serverprüfung beim Bezahlen (`runBookingCheckout`) den Tarif unabhängig von der Anzahl gewählter Tage annimmt.
- `src/components/BookingSection.tsx`: Nach Wahl der Startzeit wird `24h_300` vorausgewählt, wenn `!isPlanUnavailable`. Zeitraum-Text und Hinweis werden an den gewählten Tarif angepasst.
- Tests: `flex-days.test.ts` und ein neuer Test prüfen, dass ein einzelner Tag 3h, 6h, 24h_300, 24h_300km, 24h_500 und 24h_800 liefert und dass 6h nach 16 Uhr wegfällt.
- Browserprüfung: Tagesmiete mit einem Klick zeigt die 24-h-Tarife und lässt sich bis zur Fahrzeugauswahl durchklicken. Im Modus „Mehrere Tage“ liefert ein Klick auf heute und morgen ebenfalls die 24-h-Tarife.
