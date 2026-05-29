## Ziel
Echte, foto-realistische Transporter-Ansichten + dichtes Werbefl\u00e4chen-Raster wie im Referenzbild. Fl\u00e4chen werden vermessen und Preis automatisch aus m\u00b2 berechnet.

## 1. Neue Fotos (KI-generiert, Studio-Stil)
Im Stil des Citro\u00ebn Jumper Referenzfotos (sauber, wei\u00df, neutral, leichter Schatten). Premium-Qualit\u00e4t, keine Texte/Logos:
- `src/assets/partner/van-driver.jpg` \u2014 reine Seitenansicht Fahrerseite (links), Hochdach, lang (L4H2)
- `src/assets/partner/van-passenger.jpg` \u2014 reine Seitenansicht Beifahrerseite (rechts, Schiebet\u00fcr)
- `src/assets/partner/van-rear.jpg` \u2014 reine Heckansicht, geschlossene Fl\u00fcgelt\u00fcren
- `src/assets/partner/van-front.jpg` \u2014 reine Frontansicht (Stirn \u00fcber Windschutz + Motorhaube + Sto\u00dffl\u00e4che, vergleichbar mit Ford Transit Foto)

Alte Bilder (`transporter-*.jpg`) werden ersetzt.

## 2. Dichtes Werbefl\u00e4chen-Raster (genau wie Referenz)
Layout pro Ansicht (Polygone in `src/lib/partner-zones.ts` aktualisiert):

**Fahrerseite (16 Fl\u00e4chen)**
- Oberes Band \u00fcber Fenstern: 4 Felder (HS1-HS4)
- Mittleres Hauptband (gro\u00dfe Felder zwischen Fenster- und Schwellerlinie): 6 Felder (M1-M6)
- Unteres Schwellerband: 6 Felder (S1-S6)

**Beifahrerseite (14 Fl\u00e4chen \u2014 weniger wegen Schiebet\u00fcr)**
- Oberes Band: 4 Felder
- Mittleres Band: 5 Felder (Schiebet\u00fcr-Bereich = 1 gro\u00dfes Feld)
- Schwellerband: 5 Felder

**Heck (6 Fl\u00e4chen)**
- 2 oben \u00fcber Heckscheibe, 2 mittig auf T\u00fcrfl\u00e4chen, 2 unten

**Front (2 Fl\u00e4chen)**
- Stirnband \u00fcber Windschutzscheibe (wie auf Ford-Foto sichtbar)
- Motorhaube/Grill-Bereich

Gesamt: **~38 Pakete**.

## 3. Auto-Vermessung & Preislogik
Neue Datei `src/lib/partner-pricing.ts`:
- Pro Polygon wird die Pixelfl\u00e4che mit Shoelace-Formel berechnet
- Kalibrierung pro Ansicht: bekannte Realma\u00dfe Jumper L4H2 (L\u00e4nge 5.99m, H\u00f6he 2.52m, Breite 2.05m) \u2192 px/m Faktor
- Daraus realer m\u00b2 Wert
- Preis: **\u20ac/m\u00b2/Monat \u00d7 Fl\u00e4che**, gerundet auf 5\u20ac
- Recherchierter Marktpreis Fahrzeugwerbung DE: ~100\u20ac/m\u00b2/Monat Seite, ~120\u20ac/m\u00b2/Monat Heck (h\u00f6here Aufmerksamkeit im Stau), ~140\u20ac/m\u00b2/Monat Front
- Mindestpreis 25\u20ac/Monat
- Anzeige in Karte + Overlay: "0,8 m\u00b2 \u00b7 ab 80\u20ac/Monat"

## 4. Komponenten-Updates
- `TransporterPhotoDiagram.tsx`: neue Fotos, neue Polygon-Coords, Label zeigt jetzt `id \u2022 m\u00b2 \u2022 Preis`
- `PartnerPackages.tsx`: Liste wird aus `partner-zones.ts` + `partner-pricing.ts` generiert (keine harten Preise mehr in `partner-packages.ts`), gruppiert nach Ansicht
- `partner-packages.ts`: wird zu einem Adapter der die generierten Pakete exportiert
- `partner-inquiry.functions.ts`: unver\u00e4ndert (nimmt weiterhin packageId entgegen)

## 5. Mockup-Overlay
Bleibt wie aktuell (clipPath + mix-blend-multiply auf ad-mockup.jpg). Funktioniert auch bei den neuen, dichteren Polygonen.

## Nicht-Ziele
- Keine Backend-/Schema-\u00c4nderungen
- Keine Routen-\u00c4nderungen
- Form, Hero, Benefits bleiben unber\u00fchrt

## Technische Details
- Bildgenerierung: `imagegen` mit `model: premium`, querformat 1920\u00d71024 f\u00fcr Seiten, 1024\u00d71024 f\u00fcr Heck/Front
- Shoelace-Fl\u00e4che: `Math.abs(\u03a3(x_i \u00b7 y_{i+1} - x_{i+1} \u00b7 y_i)) / 2`
- Kalibrierung pro View als Konstante: `{ driver: { realLengthM: 5.99, pxLength: <gemessen aus viewBox> }, ... }`
