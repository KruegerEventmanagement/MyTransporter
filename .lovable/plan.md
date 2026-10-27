# Umbuchung Stifani + Crafter nur ab 5 Tagen

## 1. Buchung Costantino Stifani umbuchen
Gefunden: Buchung vom Sa. 31.10.2026, 08:00 – So. 01.11., 08:00, "24 Stunden Umzugstag", VW Crafter L5H2 (OF-DK 1234), 125 € Miete + 200 € Kaution, bezahlt.

- Vorher prüfen, dass der Jumper L4H2 (LEO MY 101) in dem Zeitraum frei ist (aktuell keine Buchung dort sichtbar).
- Buchung auf Citroen Jumper L4H2 / LEO MY 101 umstellen, gleiche Zeit, gleiche Kilometer.
- Preis auf den L4H2-Preis setzen: 109 € statt 125 € → **16 € Differenz**.
- Kalender: Der L4H2 ist dadurch Sa. 08:00 bis So. 08:00 belegt und online nicht buchbar; der Crafter wird für diesen Zeitraum wieder frei. Der Google-Kalender-Eintrag wird automatisch aktualisiert.
- Rückzahlung: Die 16 € werden in der Kautionsprüfung als Zusatzbetrag mit Begründung "Umbuchung auf L4H2, Preisdifferenz 16 €" vorgemerkt. Nach der Rückgabe überweist du per Button 200 € + 16 € = 216 € (abzüglich eventueller Abzüge). Jetzt wird kein Geld bewegt.
- Keine automatische Kundenmail; die alte Rechnung bleibt unverändert im Archiv (bei Bedarf erstelle ich eine Korrekturrechnung auf Nachfrage).

## 2. Crafter L5H2 nur noch ab 5 Tagen
- Für 3 h, 6 h, 24 h, 2–4 Tage ist der Crafter in der Fahrzeugauswahl ausgegraut und nicht wählbar, mit Hinweis: "Nur für Vermietungen ab fünf Tagen".
- Ab 5 Tagen (und Langzeit/Wochen) bleibt er normal buchbar.
- Gleiche Sperre zusätzlich serverseitig beim Bezahlen, damit niemand sie umgehen kann.
- Bestehende Buchungen bleiben unverändert. Andere Fahrzeuge unverändert.

## Technische Details
- Umbuchung per Datenänderung an `bookings` (id 6ca8b8b0…): vehicle_name/plate, plan_label "· L4H2", plan_price 109; Verfügbarkeitstrigger prüft Konflikt atomar; Kalender-Trigger erzeugt Sync-Job.
- Deposit-Review-Entwurf mit refund_override 21600 + adjustment_reason (nur Entwurf, kein Stripe-Aufruf).
- Regel `MIN_DAYS_BY_CLASS = { l5h2: 5 }` in booking-rules.ts, genutzt von BookingSection (UI + Hinweis) und Checkout-Serverfunktion (Ablehnung). Test: L5H2 mit 24h/multi_2d abgelehnt, multi_5d/Woche erlaubt, L1H1/L4H2 unberührt.
- Regel in Memory speichern.
