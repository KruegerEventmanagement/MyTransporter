# Langzeitmiete neu: Fahrzeugauswahl mit Bildern, Rechner mit Datum, Uhrzeit und Wunschkilometern, Anfrage per E-Mail

## Was der Kunde sieht (Seite /langzeitmiete)

```text
[ Mini-Bild ][ Mini-Bild ][ Mini-Bild ][ Mini-Bild ][ Mini-Bild ]   <- ausgewählter Transporter grau umrandet
<  [        großes Bild des gewählten Transporters        ]  >      <- links/rechts wischen oder Pfeile
                 Name · Klasse · Laderaum-Maße
                     [ v nächster Transporter ]
-----------------------------------------------------------------
Abholung: Datum + Uhrzeit     |   Preis live
Rückgabe: Datum + Uhrzeit     |   Tage, inkl. km, Preis/Tag
Wunschkilometer (Zahl + Regler)|  Kaution 200 € separat
                               |   [ Anfragen ]
```

1. **Transporter oben:** 4–5 kleine quadratische Vorschaubilder der aktiven Fahrzeuge. Der gewählte ist grau hinterlegt/umrandet.
2. **Große Bildansicht darunter:** Bilder des gewählten Transporters, mit dem Finger wischen oder über kleine Pfeile links/rechts blättern, Punkte zeigen die Bildnummer. Ein kleiner Pfeil unten springt zum nächsten Transporter.
3. **Rechner:** Abholdatum und -uhrzeit, Rückgabedatum und -uhrzeit, Wunschkilometer (Eingabefeld mit Regler, z. B. 500 bis 15.000 km). Der Preis steht direkt daneben (auf dem Handy direkt darunter) und ändert sich sofort.
4. **Button „Anfragen“** rechts beim Preis: Er öffnet das E-Mail-Programm des Kunden. Empfänger ist info@mytransporter.org, Betreff „Anfrage für Langzeitmiete – [Transporter]“. Der Text ist schon ausgefüllt: Fahrzeug, Kennzeichen, Abholung, Rückgabe, Tage, Wunschkilometer und berechneter Preis. Dazu kommen leere Zeilen für Name und Telefon. Der Kunde schickt die Mail von seiner eigenen Adresse.
5. **Handy:** alles untereinander, nichts lässt sich seitlich verschieben, große Tippflächen. Die Mini-Bilder passen in eine Zeile.

## Die Preis-„Intelligenz“ (feste, nachvollziehbare Regeln, keine KI)

- **Mietdauer:** Aus Datum und Uhrzeit werden angefangene 24-Stunden-Blöcke berechnet, mindestens 7 Tage. Bis zu 1 Stunde Kulanz, danach zählt der nächste Tag.
- **Grundpreis:** das bestehende Langzeit-Preismodell je Fahrzeugklasse bleibt unverändert: 7 Tage Wochenpreis minus 10 %, dann feste Preise bei 30, 45 und 60 Tagen, dazwischen tagesgenau.
- **Kilometer:** Im Grundpreis sind 4.000 km je 30 Tage anteilig enthalten.
  - Wünscht der Kunde mehr, wird der Aufpreis gestaffelt günstiger: die ersten 1.000 Zusatz-km 0,29 €/km, weitere bis 5.000 km 0,22 €/km, darüber 0,18 €/km.
  - Wünscht er weniger, gibt es eine kleine Gutschrift von 0,05 €/km, höchstens 10 % des Grundpreises.
- **Anzeige:** Gesamtpreis, Preis pro Tag, enthaltene km, Preis je weiterem km, Kaution 200 € separat.
- **Beispiel** L1H1, 30 Tage, 2.500 km: Grundpreis 999 € (4.000 km inklusive). Die 1.500 km weniger ergeben 75 € Gutschrift, also 924 €.
- **Hinweis unter dem Preis:** „Unverbindlicher Richtpreis, verbindlich erst nach Bestätigung.“

Die Staffelwerte oben (0,29 / 0,22 / 0,18 €, Gutschrift 0,05 €) sind mein Vorschlag. Bitte bestätige oder nenne mir deine Werte.

## Bilder

- Anfangs nutze ich die vorhandenen Fahrzeugfotos und Standardbilder je Klasse.
- Deine Bilder, die du nach und nach schickst, baue ich je Transporter ein.

## Unverändert

Normale Buchung, Tarife, Zahlung, Kalender, Werbung, AGB und Anmeldung bleiben unverändert. Die Langzeitmiete wird nicht online bezahlt, es gibt nur die Anfrage per E-Mail.

## Technische Details

- `src/lib/long-term.ts`: neue reine Funktionen
  - `rentalDaysFromDateTimes(startDate, startTime, endDate, endTime)`
  - `quoteLongTermWithKm(days, vehicleClass, desiredKm)`
  - Konstanten für Staffel und Gutschrift
  - bestehende `quoteLongTerm`/`longTermPriceEur` bleiben
- Neue Tests für Dauer (Uhrzeit, Kulanz, Sommerzeit Europe/Berlin), Staffel, Gutschrift-Deckel und das Beispiel mit 2.500 km.
- Fahrzeugdaten: `vehicles` (is_active, name, plate, vehicle_class, photo_urls, Maße) über eine öffentliche Lesefunktion, die nur unkritische Felder liefert. Keine VIN, Besitzer oder Notizen. Fallback-Bilder aus `src/assets`.
- Neue Komponenten:
  - `LongTermVehiclePicker`: Mini-Bilder, Karussell mit Touch-Swipe und Pfeilen, Pfeil zum nächsten Fahrzeug, ohne neue Bibliothek, falls embla schon vorhanden
  - `LongTermCalculator`
- Anfrage: `mailto:info@mytransporter.org?subject=…&body=…` mit `encodeURIComponent`. Keine Serverdaten, keine Speicherung.
- Mobil: `overflow-x-hidden`, einspaltiges Grid, `min-w-0`, Prüfung per Playwright bei 390 px. Die Meta-Angaben der Seite werden angepasst.
