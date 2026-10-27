# Fix: Tarifauswahl hängt bei „Verfügbarkeit wird geprüft…"

## Problem
Im Buchungsschritt „Wähle deinen Tarif" bleibt die Anzeige dauerhaft auf „Verfügbarkeit wird geprüft…" stehen, der Preis ist ausgegraut und „Weiter" gesperrt. Das liegt nicht an der fehlenden Fahrzeugwahl: die Seite wartet auf zwei Abfragen (belegte Zeiten und Fahrzeugliste). Kommt eine davon nie zurück, gibt es aktuell keine Zeitbegrenzung – der Ladezustand endet nie.

## Vorgehen
1. Zuerst den Fall im Browser nachstellen (gleicher Ablauf: Zeitraum 3.11., 16 Tage, 9:00) und prüfen, welche der beiden Abfragen hängt bzw. ob ein Fehler auftritt. Ursache ist noch nicht bestätigt.
2. Beide Abfragen bekommen eine Zeitbegrenzung (ca. 10 Sekunden) und einen automatischen zweiten Versuch.
3. Schlägt auch der fehl, erscheint statt endlosem Spinner ein klarer Hinweis „Verfügbarkeit konnte nicht geprüft werden" mit Knopf „Erneut prüfen" (fail closed: keine falsche Zusage, keine Buchung ohne Prüfung).
4. Falls Schritt 1 eine konkrete andere Ursache zeigt (z. B. hängende Anmeldung im Browser oder Fehler in der Serverabfrage), wird diese direkt behoben.
5. Nebenbefund prüfen: Anzeige „16 Tage" gewählt, aber Tarif „21 Tage" – kontrollieren, dass der passende Tarif richtig erklärt wird (keine Preisänderung).

## Was unverändert bleibt
Preise, Verfügbarkeitsregeln je Fahrzeug, Doppelbuchungsschutz, Reservierung, Zahlung.

## Technische Details
- `src/components/BookingSection.tsx`: `refreshBusySlots` / `refreshVehicles` mit Timeout-Wrapper (Promise.race) + ein Retry; Sequenzschutz (`busySeqRef`, `vehiclesSeqRef`) bleibt; nach Timeout `busyError`/`vehiclesError` setzen, damit bestehende Fehler-UI mit `retryAvailability` greift.
- Regressionstest: hängende Abfrage → nach Timeout Fehlerzustand statt Dauer-Ladezustand.
- Verifikation per Playwright im Buchungsablauf.
