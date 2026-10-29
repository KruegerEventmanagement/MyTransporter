# Auslastungsanzeige: nur wirklich buchbare Transporter zählen

## Ist-Zustand
Die Anzeige unter dem Kalender zählt alle freigeschalteten Fahrzeuge: LEO MY 101, LEO MY 102, PF MY 1003 und den Crafter OF-DK 1234, also 4. Der graue L1H1 LEO MY 104 ist bereits ausgeschlossen. Der Crafter wird aber mitgezählt, obwohl er erst ab fünf Tagen buchbar ist.

## Änderung
- Der Crafter zählt in der Anzeige nur mit, wenn der gewählte Zeitraum mindestens fünf Tage lang ist. Bei Tagesmiete und kurzen Mehrtagesmieten steht dann z. B. „3 von 3 Transportern ...“.
- Sobald jemand fünf Tage oder mehr wählt, zählt der Crafter automatisch wieder mit (dann 4).
- Wird später ein neues Fahrzeug freigeschaltet, zählt es automatisch mit. Es gibt keine feste Zahl.
- Der Text bleibt sonst gleich, inklusive „Noch X Transporter mit freien Zeiten (8–22 Uhr)“.
- Buchung, Preise und die eigentliche Verfügbarkeitsprüfung bleiben unverändert. Es geht nur um die Anzeige.

## Technische Details
- `src/components/BookingSection.tsx`: Für `dayOccupancy` werden eigene `occupancyPlates` berechnet: aktive Fahrzeuge, gefiltert über `MIN_DAYS_BY_CLASS[classOfVehicle(v)]` gegen die gewählte Dauer (`nights`; ohne Enddatum bzw. bei Tagesmiete gilt 1 Tag).
- Ein kleiner Test für die Filterregel kommt in eine Hilfsfunktion in `src/lib/availability-logic.ts`: Crafter ist bei 1 Tag ausgeschlossen und bei 5 Tagen enthalten.
