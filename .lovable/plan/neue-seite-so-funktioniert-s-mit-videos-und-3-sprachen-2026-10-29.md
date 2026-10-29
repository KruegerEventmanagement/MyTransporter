# Neue Seite „So funktioniert's" mit Videos und 3 Sprachen

## Was gebaut wird
- Neuer Menüpunkt **„So funktioniert's"** (eigene Seite `/so-funktionierts`), auch im Footer und in der Sitemap.
- Acht nummerierte Schritte in einfachem Deutsch, jeweils mit Symbol, kurzem Text und – wo passend – Video.
- Die drei Videos werden eingebunden (stumm abspielbar, mit Play-Knopf, Hochformat, lädt erst beim Hinscrollen):
  - Video 1 (09.55.48): Code eingeben und Schlüsselkasten öffnen
  - Video 2 (09.55.48_1): Schlüsselkasten wieder schließen
  - Video 3 (09.55.49): Wo die Schlüsselkästen am OBI stehen (Fahrradständer)
- Sprachumschalter **DE / EN / RU** oben auf der Seite. Die Wahl wird gemerkt.

## Die Texte (Deutsch)

**1. Datum wählen**
Wähle im Kalender, von wann bis wann du den Transporter brauchst. Nur heute? Dann tippe nur auf heute. Brauchst du ihn länger als 24 Stunden, tippe zusätzlich auf den nächsten Tag.

**2. Uhrzeit und Tarif**
Wähle, ab wie viel Uhr du den Transporter möchtest. Dann wähle deinen Tarif: normal oder mit mehr Kilometern.

**3. Fahrzeug und Zubehör**
Wähle das passende Fahrzeug. Bei jedem Transporter siehst du Laderaum in Kubikmetern, Höhe und Länge der Ladefläche.
- Nur in der Stadt unterwegs? Der LEO MY 102 ist auf 100 km/h begrenzt – für kurze Wege ideal.
- Autobahnfahrt? Mit dem PF MY 1003 fährst du bequemer.
- Viel oder langes Ladegut? Achte auf die Länge der Ladefläche.

**4. Verifizierung**
Mache einfache Fotos von Führerschein und Ausweis (Vorder- und Rückseite) und lade sie hoch.

**5. Registrieren und bezahlen**
Registriere dich mit deiner E-Mail und einem selbst gewählten Passwort. Dann bezahlst du online.

**6. Schlüsselcode per E-Mail**
Du bekommst eine Buchungsbestätigung und die Rechnung. 15 Minuten vor Abholung kommt eine E-Mail mit deinem Schlüsselcode und der Nummer deines Schlüsselkastens.
[Video 1: So öffnest du den Schlüsselkasten] [Video 2: So schließt du ihn wieder]

**7. Schlüssel abholen und zum Transporter**
Die Schlüsselkästen hängen beim OBI in Leonberg, vor dem Eingang an den Fahrradständern.
[Video 3: Hier findest du die Schlüsselkästen]
Die Transporter stehen in der Nähe der Adresse **An der Poststraße 63** (ca. 500 m). Die Adresse dient nur zur Orientierung. **Bitte an keiner Haustür klingeln** – die Anwohner haben mit der Vermietung nichts zu tun.

**8. Fahrt und Fotos**
In der App öffnet sich deine Fahrtseite. Dort kannst du auch die Navigation starten.
- **Vor der Fahrt:** Fotos vom Kilometerstand und vom Zustand des Fahrzeugs.
- **Nach der Fahrt:** Kilometerstand, Tankbeleg, Zustand außen, Innenraum und Laderaum.
Die Fotos sind zu deiner Sicherheit. Fehlen sie, muss ein Mitarbeiter das Fahrzeug prüfen. Dafür berechnen wir **mindestens 30 €**.

Englisch und Russisch: gleiche Inhalte, sinngemäß übersetzt.

## Offene Punkte
- Die Sprachauswahl gilt zunächst für diese neue Seite. Die ganze Website (Buchung, Mails, Rechnung) zu übersetzen ist ein großes eigenes Projekt – das machen wir danach separat, wenn gewünscht.
- Nichts wird veröffentlicht, bis du es sagst.

## Technische Details
- Videos per `lovable-assets` hochladen, Pointer in `src/assets/`, `<video controls playsInline muted preload="none" poster>`; Poster-Frames per ffmpeg erzeugen.
- Route `src/routes/so-funktionierts.tsx` mit eigenem `head()` (Titel/Beschreibung/OG), Eintrag in Navigation, Footer, `sitemap[.]xml.ts`; Seite in `ad-placements.ts` ohne Werbung (fail-closed bleibt).
- Übersetzungen als einfaches typisiertes Wörterbuch `src/lib/how-it-works-i18n.ts` (de/en/ru); Sprache per `?lang=` + localStorage nach Hydration, `<html lang>` passend; Standard Deutsch für SSR/SEO.
- Monochromes Design, Fredoka, Buttons schwarz; Kennzeichen/Tempolimit aus vorhandenen Fahrzeugdaten prüfen statt hart codieren, wo möglich.
