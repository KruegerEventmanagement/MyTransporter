## Ziel

Die `/partner` Seite an die Referenz-Infografik (ChatGPT-Bild) anpassen: gleicher Aufbau, gleiche Anzahl & Art der Werbeflächen, realistische monatliche Preise basierend auf Marktvergleich (Werbung auf Transportern in DE: ~50–300 €/Monat je Fläche).

## Werbeflächen (genau wie Referenz, 5 Kategorien, insgesamt 28 Flächen-Slots)

| Kat. | Code | Bezeichnung | Größe | Preis/Monat | Anzahl |
|---|---|---|---|---|---|
| 1 | HS1, HS2 | **Hauptsponsor** – größte Seitenfläche | 140 × 80 cm | **249 €** | 2 |
| 2 | L1, L2 | **Leschi** – Premium-Seitenfläche | 100 × 60 cm | **129 €** | 2 |
| 3 | HG1, HG2 | **Heck Goldplatz** – Hecktüren, ideal für QR/CTA | 90 × 50 cm | **149 €** | 2 |
| 4 | C1–C10 | **City Spot** – Standard-Werbefläche regional | 60 × 40 cm | **69 €** | 10 |
| 5 | M1–M10 | **Mini Spot** – kompakte Zusatzfläche | 30 × 25 cm | **29 €** | 10 |

Zusätzlich einmalige **Druck- & Produktionsgebühr 149 €** (Magnetfolie 0,9 mm, wetterfest).

Laufzeiten weiterhin 1/2/3 Jahre mit Staffelrabatt (10 % / 20 %) auf den Monatspreis.

## Markt-Referenz (kurz, in Code-Kommentar dokumentiert)

- Mobile Außenwerbung DE: typ. 50–400 €/Monat je Fläche
- Hauptsponsor-Großflächen (Trikot-/Fahrzeugsponsoring im Amateurbereich): 200–300 €/Monat
- Heck mit QR/CTA: 120–180 €/Monat (höchster Blickkontakt im Stau)
- Kleine City-Spots: 50–80 €/Monat
- Mini-Logo-Flächen (Sponsorenwand-Stil): 20–40 €/Monat

→ unsere Preise liegen mittig und sind realistisch für Region Böblingen.

## Code-Änderungen

**1. `src/lib/partner-packages.ts`** – komplett ersetzen
- 5 Pakete: `hauptsponsor`, `leschi`, `heck_goldplatz`, `city_spot`, `mini_spot`
- Felder: id, code, name, beschreibung, größe (cm × cm), monatspreis, anzahlVerfügbar, farbe (Token), positionen[]
- Tier-Preise (1J = voll, 2J = −10 %, 3J = −20 %, jeweils ×12 als Jahressumme)
- Setup-Fee bleibt 149 €

**2. `src/components/partner/TransporterDiagram.tsx`** – komplett neu im Stil der Referenz
- 4 Ansichten untereinander/grid: Fahrerseite (links), Beifahrerseite (rechts), Heck, Front
- Transporter als sauberes monochromes SVG (Citroën Jumper / Peugeot Boxer Silhouette, L4H3-Proportion)
- Werbeflächen als farbige Rechtecke mit gestricheltem Rahmen + Code-Label (HS1, L1, C1 …)
- Farb-Tokens (monochrom-kompatibel, nur Akzent-Outlines):
  - Hauptsponsor: gefüllt dunkelgrau, dicker Rand
  - Leschi: schraffiert
  - Heck Goldplatz: gepunktet
  - City: dünn gestrichelt
  - Mini: sehr dünn
- Klick auf Fläche → scrollt zum jeweiligen Paket / setzt Auswahl im Formular
- Header-Icons: Sichtbarkeit, Magnetisch, Wetterfest, Austauschbar (wie Referenz)

**3. `src/components/partner/PartnerPackages.tsx`** – 5 Karten statt 4
- Jede Karte zeigt: Farb-Indikator, Code, Name, Größe, „X Plätze verfügbar", Monatspreis groß, Laufzeit-Tabs (1/2/3 J mit Rabatt), kurzer Nutzen-Text
- CTA „Diese Fläche anfragen" füllt Formular vor

**4. `src/components/partner/PartnerBenefits.tsx`** – Footer-Block wie Referenz
- 4 Icons: Magnetisch haftend · Wetterfest & UV-beständig · Einfach wechselbar · Kosteneffizient & mehr Reichweite

**5. `src/components/partner/PartnerInquiryForm.tsx`** – nur Select-Optionen anpassen (5 statt 4 Pakete + „mehrere Flächen kombinieren")

**6. `src/routes/partner.tsx`** – Sektion-Reihenfolge bleibt; Headline anpassen: „Werbeflächen am Transporter – über 25 Plätze, ab 29 € / Monat"

**7. `src/lib/partner-inquiry.functions.ts`** – Zod-Enum auf neue 5 Paket-IDs erweitern, E-Mail-Template entsprechend.

## Nicht betroffen

Navbar, Footer, Routing, Auth, andere Seiten — keine Änderungen.

## QA

- Diagramm in 928 px Vorschau prüfen (Mobile-first stacking)
- Klick-Hotzones treffen die richtigen Rechtecke
- Formular sendet mit neuen Paket-IDs erfolgreich
