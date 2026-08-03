# Werbeflächen statt "Partner werden"

Das Thema wird neu positioniert: kein "Partner werden" mehr, sondern ein Werbe-Angebot ("Ihre Werbung durch die gesamte Region mit MyTransporter") mit Clickbait-Banner auf der Startseite und attraktiven Aktionspreisen.

## 1. Neuer Werbebanner auf der Startseite

Direkt unter dem Logo und oberhalb von "Buche deinen Transporter" kommt ein kompakter, auffälliger Banner (max. ca. 90 px hoch, volle Breite im Container, abgerundet):

- Kleines pulsierendes Badge: "Neu · Aktion"
- Headline (eine Zeile, fett): "Ihre Werbung durch die gesamte Region mit MyTransporter"
- Subline (klein): "Täglich gesehen in Leonberg, Stuttgart & ganz Baden-Württemberg – ab 19 € / Monat"
- Kleiner Button rechts: "Jetzt Fläche buchen" → führt auf `/werbung`
- Dezente Lauf-/Shine-Animation, Hover-Lift; monochrom (schwarz/weiß/grau) passend zum Design
- Banner bleibt schmal, damit die Buchung unverändert direkt darunter startet

## 2. "Partner werden" verschwindet komplett

- Navbar-Link: "Partner werden" → "Werbung" (bzw. "Werbefläche")
- Footer-Links auf Startseite und Über-uns-Seite: "Partner werden" → "Werbung am Transporter"
- Route `/partner` wird zu `/werbung` (alter Pfad leitet auf die neue Seite um, damit bestehende Links/Google nichts verlieren)
- Alle Texte auf der Seite, in Titel, Beschreibung und im Anfrage-Mailing: "Partner/Sponsor" → "Werbekunde / Werbefläche"

## 3. Werbeseite neu getextet (Nutzen-Argumentation)

Neue Hero-Aussage: "Ihre Werbung durch die gesamte Region" + Sublines zu Reichweite:
- Unterwegs in Leonberg, Stuttgart, Böblingen, Sindelfingen, Ludwigsburg – auf Wunsch Baden-Württemberg- und deutschlandweit
- Gesehen bei Veranstaltungen, Baumärkten, IKEA, Cafés, Wohngebieten, Innenstadt
- Neuer Abschnitt "Warum Werbung am Fahrzeug wirkt": Wiederholungseffekt / unterbewusste Wahrnehmung – ein Motiv, das man immer wieder auf einem fahrenden oder parkenden Fahrzeug sieht, bleibt stärker hängen als klassische Anzeigen; kein Streuverlust, 24/7 sichtbar, einmalige Kosten pro Monat statt Klickpreise
- Vergleichs-Kachelreihe: Fahrzeugwerbung vs. Flyer vs. Online-Ads (Sichtbarkeit, Kosten pro Monat, Laufzeit)

## 4. Preise "schmackhaft" machen

- Einstiegspreis absenken: Mindest-Monatspreis von 25 € auf 19 € (Aktionspreis)
- Aktionsrabatt: -30 % auf alle Flächenpreise, sichtbar als durchgestrichener Originalpreis neben dem Aktionspreis ("statt 89 € – jetzt 62 €")
- Einrichtungsgebühr (Folienproduktion) im Aktionszeitraum von 149 € auf 0 € ("Folienproduktion geschenkt")
- Laufzeit-Staffel bleibt (1/2/3 Jahre, länger = günstiger), zusätzlich Hinweis "monatlich ab 19 €"
- Alle Preise weiterhin klar als netto zzgl. 19 % MwSt. gekennzeichnet
- Kleiner Verknappungs-Hinweis: "Nur wenige Flächen pro Fahrzeug verfügbar"

## Technische Umsetzung

- Neue Komponente `src/components/AdBanner.tsx`, eingebaut in `src/routes/index.tsx` zwischen `HeroSection` und `BookingSection`
- `src/routes/partner.tsx` → `src/routes/werbung.tsx` (Texte/Meta/Canonical angepasst), neue Datei `src/routes/partner.tsx` mit Redirect auf `/werbung`
- Preislogik in `src/lib/partner-packages.ts`: `MIN_MONTHLY = 19`, `SETUP_FEE = 0`, Aktions-Faktor 0.7 plus `listMonthly` (Originalpreis) für die Streichpreis-Darstellung
- Anzeige der Streichpreise in `src/components/partner/PartnerPackages.tsx` und `TransporterPhotoDiagram.tsx`
- Textanpassungen in `Navbar.tsx`, `index.tsx`, `ueber-uns.tsx`, `partner-inquiry.functions.ts`, `PartnerBenefits.tsx`, `PartnerInquiryForm.tsx`
- Sitemap-Eintrag auf `/werbung` aktualisieren
