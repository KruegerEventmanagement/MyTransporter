# Blockbuchung Claudia Seuffert (19.–21.09.2026)

## Ziel
Der Transporter soll von Samstag, 19.09.2026 09:00 Uhr bis Montag, 21.09.2026 09:00 Uhr als vermietet gelten – im Kalender gesperrt, mit Kundin und Buchung sichtbar im Admin-Bereich.

## Kundin
- Name: Claudia Seuffert
- E-Mail: seuffertc@icloud.com
- Privatkonto, erscheint danach unter "Kunden" im Admin-Bereich

## Buchung
- Tarif: "2 Tage Kurzprojekt" (passt exakt: 2 Nächte, Rückgabe zur gleichen Uhrzeit)
- Start: 19.09.2026, 09:00 Uhr, Rückgabe: 21.09.2026, 09:00 Uhr
- Preis: 159 € Miete + 200 € Kaution = 359 € gesamt
- Inklusive 600 Freikilometer, danach 35 ct/km
- Status: bezahlt, Kaution hinterlegt, Abholcode wird generiert
- Fahrzeug: der aktive Transporter aus der Fahrzeugverwaltung

## Wirkung im Kalender
Die Buchungs-Belegung wird bereits automatisch aus bestehenden Buchungen gelesen – der 19., 20. und 21.09.2026 werden dadurch als nicht buchbar angezeigt, ohne Änderung an der Kalenderlogik.

## Technische Umsetzung
1. Einmalige, adminseitig ausgelöste Aktion, die über die Auth-Admin-API ein Benutzerkonto für seuffertc@icloud.com anlegt (Name in den Metadaten, damit der bestehende Trigger das Profil erzeugt). Kein E-Mail-Versand an die Kundin.
2. Danach Einfügen der Buchungszeile in `bookings` mit `plan_id = multi_2d`, `start_date = 2026-09-19`, `start_hour = 9`, `plan_price = 159`, `deposit = 200`, `free_km = 600`, `km_price_cents = 35`, `status = paid`, Fahrzeugname/Kennzeichen des aktiven Fahrzeugs.
3. Prüfung: Buchung erscheint in Admin → Buchungen und Kunden, Kalender zeigt 19.–21.09. gesperrt.

## Hinweis
Für den 19.–21.09. greift zusätzlich noch der bestehende Sperrzeitraum bis 07.09.2026 nicht mehr – die neue Buchung ist dann die einzige Sperre in diesem Zeitraum.
