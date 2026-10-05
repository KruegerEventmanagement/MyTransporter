# Alte, nie abgeschlossene Buchungen verfallen lassen

## Ursache (geprüft)
In der Datenbank stehen noch drei Buchungen aus Mai 2026, die nie richtig beendet wurden (zwei mit Status „aktiv“, eine „in Rückgabe“). Die App sucht nur nach dem Status, nicht nach dem Datum. Deshalb gelten sie für immer als „laufende Fahrt“, und unten erscheint dauernd die schwarze Leiste „Sofort zurückkehren“, die zur alten Fahrt führt. Im Profil steht außerdem „Aktive Fahrt“ bzw. „Zur Fahrt“.

## Neue Regel
- **Stichtag 06.10.2026 (Berliner Zeit):** Jede Buchung, die an diesem Tag oder später beginnt, muss wie bisher vollständig abgeschlossen werden (Kilometer, Tank, Fotos, Rückgabecode). Daran ändert sich nichts.
- **Buchungen mit Beginn vor dem Stichtag**, die noch offen sind, gelten als verfallen:
  - keine Leiste „Sofort zurückkehren“ mehr
  - kein „Aktive Fahrt“-Hinweis und kein „Zur Fahrt“-Knopf im Profil
  - keine 10-Minuten-Rückgabe-Erinnerung per Push
  - öffnet man den alten Link direkt, erscheint ein ruhiger Hinweis „Diese Buchung ist abgelaufen“ mit Logo zur Startseite statt des Rückgabeablaufs
- Die alten Buchungen bleiben in der Buchungsübersicht/Historie sichtbar und werden **nicht gelöscht oder verändert**. Neue Buchungen sind ganz normal möglich.
- Admin-Bereich, Rechnungen, Zahlungen, Kaution und Verfügbarkeit bleiben unverändert (alte Zeiträume blockieren schon heute keine künftigen Termine).

## Technische Details
- `src/lib/active-trip.ts`: Konstante `TRIP_COMPLETION_REQUIRED_FROM = "2026-10-06"` plus `isLegacyOpenTrip(row)` (Berliner `start_date` vor Stichtag). `pickActiveTrip` filtert Altfälle heraus; `phaseFor` bekommt optional ein Legacy-Flag → neue Phase `"expired"`.
- `src/hooks/useActiveTrip.ts`: zusätzlich `.gte("start_date", Stichtag)` in der Abfrage (Banner verschwindet sofort, auch bei Realtime/Polling).
- `src/routes/profil.tsx`: „Aktive Fahrt“-Karte und „Zur Fahrt“-Knopf nur für Nicht-Altfälle; Altfälle bekommen dort das Label „Abgelaufen“.
- `src/routes/trip.$bookingId.tsx`: Phase `"expired"` zeigt eine schlichte Hinweisseite mit BrandHomeLink und Link zum Profil; kein Zugriff auf Rückgabeformular für Altfälle.
- `src/lib/return-reminder.ts`: Altfälle aus `dueReturnReminders` ausschließen.
- Keine Migration, keine Datenänderung, Server-Rückgabe `report_trip_return` und Statusschutz bleiben unverändert.
- Tests: Unit-Tests für `pickActiveTrip`/`phaseFor`/Reminder mit Buchungen vor/nach Stichtag, Komponententest für Banner und Ablauf-Hinweis; danach Typecheck und komplette Testsuite. Kein Deploy ohne deine Freigabe.
- `AGENTS.md`: eine Regel zum Stichtag für Pflicht-Abschluss ergänzen.
