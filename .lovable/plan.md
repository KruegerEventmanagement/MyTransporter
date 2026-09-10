# Zwei weitere Citroën Jumper L1H1 anlegen (noch gesperrt)

## Ziel
Zwei zusätzliche Fahrzeuge mit den Kennzeichen **LEO MY 103** und **LEO MY 104** anlegen – identisch zum vorhandenen Citroën Jumper L1H1 (LEO MY 102): gleiche Preise, gleiche Maße, gleicher Abholort, gleiches Foto. Beide Fahrzeuge sind zunächst **nicht buchbar**.

## Was angelegt wird
Je Fahrzeug:
- Name „Citroen Jumper L1H1“, Marke Citroen, Modell Jumper, Diesel, 74 kW, 3 Sitze, weiß
- Maße: 4,96 × 2,05 × 2,25 m, Ladefläche 2,67 × 1,87 × 1,66 m, ca. 8 m³
- Zulässiges Gesamtgewicht 3.000 kg, Zuladung 1.080 kg
- Abholort: Leonberg, Poststraße 60, 71229 Leonberg
- Foto: dasselbe Bild wie beim ersten L1H1
- Kennzeichen: LEO MY 103 bzw. LEO MY 104
- Fahrzeug-eigene Felder wie Fahrgestellnummer und Erstzulassung bleiben leer, bis du sie im Adminbereich nachträgst

## Preise
Es sind keine Preisänderungen nötig. Die Preise hängen an der Fahrzeugklasse (kurzer L1H1), nicht am einzelnen Fahrzeug – die beiden neuen Jumper bekommen damit automatisch exakt dieselben Preise wie LEO MY 102.

## Sperrung
Doppelt abgesichert, damit niemand sie versehentlich bucht:
1. Beide Fahrzeuge werden als „nicht aktiv“ angelegt – dadurch erscheinen sie gar nicht in der Fahrzeugauswahl der Buchung.
2. Zusätzlich erhält jedes Fahrzeug eine Sperrzeit für die kommenden Jahre, damit auch bei späterem Aktivieren keine Buchung durchrutscht, solange du die Sperre nicht entfernst.

Im Adminbereich siehst du beide Fahrzeuge sofort. Sobald du sie freigeben willst: Fahrzeug auf aktiv setzen und die Sperrzeit löschen.

## Technische Details
- Datenoperation (kein Schema-Wechsel): `INSERT` in `public.vehicles` mit `is_active = false`, Feldwerte kopiert von `LEO MY 102`, `photo_urls` mit derselben Storage-URL.
- Zusätzlich je Fahrzeug ein Eintrag in `public.vehicle_blocks` (`vehicle_id`, `vehicle_plate`, Zeitraum bis 2030, `reason: "Noch nicht freigegeben"`), damit `vehicle_conflicts` / `create_booking_hold_atomic` und der Webhook-Check greifen.
- Keine Änderungen an Buchungs-, Verfügbarkeits-, Stripe-, E-Mail-, Rechnungs- oder Kalenderlogik; `booking-rules.ts` bleibt unverändert.
- Abschließend Kontrolle: Fahrzeugliste im Adminbereich, Fahrzeugauswahl in der Buchung (nur die freigegebenen Fahrzeuge sichtbar), Verfügbarkeitsprüfung für LEO MY 103/104 liefert „belegt“.
