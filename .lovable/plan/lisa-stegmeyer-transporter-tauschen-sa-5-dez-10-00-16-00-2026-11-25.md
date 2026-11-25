# Lisa Stegmeyer: Transporter tauschen (Sa., 5. Dez., 10:00–16:00)

## Was ich gefunden habe
- Buchung von Lisa Stegmeyer: Sa., 5. Dez. 2026, 10:00–16:00, Tarif „6 Stunden Umzug Mini“, bezahlt, Fahrzeug PF MY 1003 (Citroen Jumper L1H1).
- LEO MY 101 (Citroen Jumper L4H2) ist an diesem Tag frei: keine Buchung, kein manueller Termin, keine Sperre.
- Ihre erste Bestätigungsmail und Rechnung sind bereits verschickt.

## Was ich mache
1. Die Buchung auf LEO MY 101 (Citroen Jumper L4H2) umstellen. Kundin, Datum, Uhrzeit, Tarif, Preis und Kaution bleiben gleich. Es wird nichts nachberechnet.
2. Damit ist PF MY 1003 für diesen Zeitraum automatisch wieder frei.
3. Der Kalender auf info@mytransporter.org wird über den bestehenden Abgleich angepasst (Eintrag zeigt dann LEO MY 101, kein doppelter Termin).
4. Lisa bekommt eine einmalige Mail „Ihre Buchung wurde umgestellt“ mit dem neuen Transporter LEO MY 101 (L4H2), gleichem Termin, Abholort Poststraße 63 Leonberg und Buchungsnummer. Die alte Rechnung bleibt unverändert, es wird keine zweite Rechnung erzeugt.
5. Prüfen: Buchung zeigt LEO MY 101, PF MY 1003 ist frei, Mail ist mit Bestätigung des Mailanbieters verschickt.

## Technische Details
- Update von bookings.vehicle_name/vehicle_plate für 24e4e5a9-…; Verfügbarkeitstrigger prüft LEO MY 101 atomar.
- Bestehende succeeded-Actions werden nicht erneut ausgelöst (keine erzwungenen Resends). Die Umstellungsmail läuft einmalig über den bestehenden Gmail-Versandweg mit eigenem Idempotenzschlüssel, damit sie nicht doppelt rausgeht.
- Schlüsselcode-Mail 15 Min vorher nutzt danach automatisch den Code von LEO MY 101.
