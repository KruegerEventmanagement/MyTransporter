
## Ziel

Eine neue Unterseite **„Partner werden"** (`/partner`) für MyTransporter, auf der Unternehmen Werbeflächen am Transporter als Magnetfolie mieten können. Schöne grafische Darstellung des Transporters mit eingezeichneten Flächen + Anfrageformular per E-Mail.

## Was gebaut wird

### 1. Neue Route `/partner`
- Datei: `src/routes/partner.tsx`
- Eigene SEO-Metadaten (title, description, og:title/description)
- Link in `Navbar` und im Footer (`src/routes/index.tsx`)

### 2. Hero-Bereich
- Überschrift: **„Werden Sie Partner von MyTransporter"**
- Sub: Sponsor-/Werbepartner werden in Leonberg & Region
- Kurzer Motivationstext (Reichweite, lokale Sichtbarkeit, mobile Werbung)
- CTA-Button → scrollt zum Anfrageformular

### 3. Transporter-Grafik mit Werbeflächen
- Seitenansicht eines Transporters als **SVG** (sauber im Stil monochrom schwarz/weiß/grau, passend zur Brand)
- Über das SVG werden die buchbaren Flächen als **gestrichelte Rechtecke** (dashed) gelegt, jeweils mit kleinem Label (Größe in cm)
- Hover/Klick auf eine Fläche → highlightet die passende Karte in der Pakete-Liste darunter
- Flächen, die abgebildet werden:
  - **Große Seitenfläche** ca. 200×100 cm
  - **Mittlere Seitenfläche** ca. 100×60 cm
  - **Kleine Fläche** ca. 50×30 cm
  - **Heckklappe** ca. 120×80 cm
  - Platzhalter „weitere kleine Flächen auf Anfrage" (der User reicht später Beispielbilder nach)

Hinweis: Erste Version mit einem stilisierten SVG-Transporter. Sobald der User Referenzfotos schickt, kann das Bild ersetzt / ein realistischeres Asset generiert werden.

### 4. Pakete & Preise
Eine Karten-Sektion mit den 4 Flächen-Größen. Jede Karte zeigt:
- Größe (cm)
- Preise für 1 / 2 / 3 Jahre (je länger, desto günstiger pro Jahr)
- Hinweis auf einmalige Bearbeitungsgebühr für die Magnetfolie

**Preisvorschlag (übernommen aus der Auswahl):**

| Fläche | 1 Jahr | 2 Jahre | 3 Jahre |
|---|---|---|---|
| Groß (200×100) | 1.200 € | 2.000 € (1.000 €/J) | 2.700 € (900 €/J) |
| Heckklappe (120×80) | 800 € | 1.400 € | 1.950 € |
| Mittel (100×60) | 600 € | 1.000 € | 1.350 € |
| Klein (50×30) | 300 € | 520 € | 720 € |

Einmalige Bearbeitungs-/Produktionsgebühr Magnetfolie: **149 €** (skaliert ggf. nach Größe – im ersten Wurf einheitlich, leicht änderbar).

Alle Preise stehen sauber in einer Konstante in `src/lib/partner-packages.ts`, damit sie später einfach angepasst werden können.

### 5. Vorteile von Magnetfolie (Info-Sektion)
Eigene Sektion mit Icons + kurzen Texten:
- **Austauschbar** – Motiv jederzeit wechselbar
- **Schonend** – kein Kleber, kein Lackschaden
- **Wiederverwendbar** – einmal produziert, mehrfach montierbar
- **Flexibel** – Vertrag erlischt? Folie geht einfach ab
- **Mobile Werbung** – Reichweite in Leonberg, Stuttgart & Region

### 6. Ablauf-Erklärung (3 Steps)
„So funktioniert's":
1. Fläche & Laufzeit wählen, Anfrage senden
2. Wir erstellen Angebot + produzieren Magnetfolie
3. Folie wird am Transporter angebracht – Werbung läuft

### 7. Anfrageformular (E-Mail)
Am Ende der Seite. Felder:
- Firma / Name
- E-Mail (Pflicht)
- Telefon (optional)
- Gewünschte Fläche (Select, vorausgefüllt wenn vorher eine Karte geklickt wurde)
- Laufzeit (1 / 2 / 3 Jahre)
- Nachricht / Motivbeschreibung
- DSGVO-Hinweis-Checkbox

**Versand:**
- Server-Function `src/lib/partner-inquiry.functions.ts` (`createServerFn`)
- Validierung mit **Zod** (Längen, E-Mail-Format)
- Schickt E-Mail an Admin-Postfach via bestehende Email-Infrastruktur (gleiche Mechanik wie `booking-emails`/`admin-notify`)
- Legt zusätzlich Eintrag in `admin_notifications` ab (Typ `partner_inquiry`), damit es im Admin-Backend sichtbar ist
- Keine neue Tabelle nötig im ersten Wurf

### 8. Navigation
- Neuer Eintrag „Partner werden" in `src/components/Navbar.tsx`
- Footer-Link in `src/routes/index.tsx`

## Design

- Streng monochrom (Schwarz/Weiß/Grau), Fredoka-Font – konsistent mit bestehender Seite
- Gestrichelte Outlines am Transporter in Schwarz auf weißem/grauem Hintergrund
- Karten im gleichen Stil wie `InfoSection`/`BookingSection`
- Mobile-first responsive

## Technische Details

- `src/routes/partner.tsx` – Seite
- `src/components/partner/TransporterDiagram.tsx` – SVG mit interaktiven Flächen
- `src/components/partner/PartnerPackages.tsx` – Preis-Karten
- `src/components/partner/PartnerBenefits.tsx` – Magnetfolie-Vorteile
- `src/components/partner/PartnerInquiryForm.tsx` – Formular (Client) + `useServerFn`
- `src/lib/partner-packages.ts` – Daten/Preise (eine Source of Truth)
- `src/lib/partner-inquiry.functions.ts` – Server-Function, Zod-Validierung, E-Mail-Versand + Admin-Notification
- Navbar + Footer Links ergänzt

## Was später noch kommt (nicht in diesem Schritt)

- Echte Referenzfotos / realistisches Transporter-Bild einsetzen, sobald geliefert
- Weitere kleine Werbeflächen einzeichnen, sobald Beispielbilder kommen
- Optional: Online-Buchung mit Stripe statt Anfrageformular (aktuell bewusst Anfrageformular gewählt)
