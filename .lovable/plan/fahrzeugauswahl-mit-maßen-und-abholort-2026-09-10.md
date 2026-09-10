# Fahrzeugauswahl mit Maßen und Abholort

Die Klassenauswahl verschwindet aus "Uhrzeit & Tarif" und wird Teil der Fahrzeugauswahl. Dort sieht der Kunde jedes Fahrzeug mit Außenlänge, Ladefläche, Ladevolumen und Abholort und wählt damit gleichzeitig die Preisklasse.

## Schritt "Uhrzeit & Tarif"

- Der Block "Wähle deine Fahrzeugklasse" wird entfernt.
- Tarife zeigen den Preis "ab" (kurzer Transporter) plus Hinweis: langer Transporter mit Hochdach kostet 10 € pro Miettag mehr, der Endpreis erscheint nach der Fahrzeugwahl.
- Verfügbarkeitsprüfung für Tage/Uhrzeiten/Tarife bleibt unverändert: ein Tarif ist wählbar, solange irgendein Fahrzeug im Zeitraum frei ist.

## Schritt "Fahrzeug & Zubehör"

- Jede Fahrzeugkarte zeigt zusätzlich: Klasse (kurz/lang), Außenlänge, Ladefläche (Länge × Breite × Höhe), Ladevolumen in m³ und Abholort mit Adresse.
- Die Liste unter der Karte zeigt pro Fahrzeug kurz Klasse, Länge, m³, Abholort und Verfügbarkeit; nicht verfügbare Fahrzeuge bleiben wie bisher gesperrt.
- Der gewählte Transporter bestimmt den Endpreis; die Summenanzeige in diesem Schritt zeigt den tatsächlichen Tarifpreis mit einem Hinweis, wenn der lange Transporter Aufpreis hat.
- Fällt der gewählte Tarif für die neue Klasse weg oder wechselt der Preis, wird das direkt in der Zusammenfassung sichtbar; ein weiterhin gesperrtes Fahrzeug blockiert wie bisher "Buchen & bezahlen".

## Neue Fahrzeugdaten

Neue Felder pro Fahrzeug (im Adminbereich pflegbar):

- Außenlänge, Außenbreite, Außenhöhe
- Ladefläche Länge, Breite, Höhe
- Ladevolumen in m³
- Abholort (Name/Kurzform) und Abholadresse

Vorbelegung mit üblichen Herstellerwerten, jederzeit im Adminbereich korrigierbar:

- kurzer Transporter (L1H1): ca. 4,96 m lang, Ladefläche ca. 2,67 × 1,87 × 1,66 m, ca. 8 m³
- langer Transporter (L4H2): ca. 6,36 m lang, Ladefläche ca. 4,07 × 1,87 × 1,93 m, ca. 15 m³

Abholorte:

- VW Crafter: Calwer Straße 29, 75331 Grunbach (Engelsbrand)
- alle übrigen Fahrzeuge: Poststraße 60, 71229 Leonberg

## Adminbereich

Im Fahrzeugformular kommen die neuen Felder als eigener Abschnitt "Maße & Abholort" hinzu, damit neue Fahrzeuge direkt vollständig angelegt werden können.

## Technische Details

- Migration: neue nullable Spalten auf `public.vehicles` (`length_cm`, `width_cm`, `height_cm`, `cargo_length_cm`, `cargo_width_cm`, `cargo_height_cm`, `cargo_volume_m3`, `pickup_location`, `pickup_address`) — rückwärtsverträglich, keine Datenlöschung. Anschließend Datenupdate mit den obigen Werten je Fahrzeug.
- `BookingSection.tsx`: Klassenauswahl-Block in Schritt 1 entfernen, Tarifkarten auf "ab"-Preis (Basis L1H1) plus Aufpreishinweis umstellen; `vehicleClass` bleibt aus dem gewählten Fahrzeug abgeleitet, Preis-/Hold-/Checkout-Logik unverändert. Fahrzeug-Select in `vehicles`-Query um die neuen Spalten erweitern und in `displayVehicle` abbilden.
- `VehiclesAdmin.tsx`: neue Eingabefelder plus Speichern der neuen Spalten.
- Keine Änderungen an Preisen in `booking-rules.ts`, Stripe, Verfügbarkeitsprüfung, E-Mails, Rechnung oder Kalender.
- Abschluss: Typecheck, Vitest und Produktionsbuild.
