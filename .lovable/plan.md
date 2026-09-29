# Werbung auf mytransporter.org: Bestandsaufnahme und nächste Schritte

## Ergebnis der Prüfung (29.09.2026, nur gelesen)

Auf der Live-Seite läuft **keine fremde Werbung**. Gemessen auf der Startseite (Desktop 1440 px und iPhone 390 px): keine Werbeflächen im Code der Seite, keine Anfragen an Google-Anzeigendienste und keine an Awin.

### 1. AdSense (Anzeigen von Google, die Geld bringen)
- Die Kennung des AdSense-Kontos ist hinterlegt: `ca-pub-6974851907377988` (`src/lib/adsense.ts` Z. 39, Bestätigungs-Tag in `src/routes/__root.tsx` Z. 85, live vorhanden).
- Zwei echte Werbeflächen sind hinterlegt: Seitenleiste links `4238348588`, rechts `6950298526` (`adsense.ts` Z. 43–46). Sie erscheinen nur auf großen Bildschirmen ab 1280 px (`AdRails.tsx`, Klasse `xl:block`). Auf dem Handy gibt es absichtlich keine Werbefläche.
- Eingebunden ist das auf: Startseite, /werbung, /preise, /langzeitmiete, /faq, /ueber-uns, /kontakt.
- `public/ads.txt` ist live mit Status 200 und korrektem Eintrag.
- **Die Werbung ist absichtlich gesperrt.** Alle vier Schalter stehen auf „aus“ (`adsense.ts` Z. 38–50): `enabled`, `siteApproved`, `certifiedCmpConfigured`, `liveCmpVerified`.
- Die Anbindung an eine offizielle Google-Einwilligungsabfrage ist im Code vorbereitet (`src/lib/adsense-cmp.ts`, Registrierung Z. 564).
- Der heutige Cookie-Hinweis deckt nur die Messung von Google Ads, Meta und Microsoft ab, **keine Werbeanzeigen**. Diese Einwilligung darf deshalb nicht für AdSense verwendet werden.

### 2. Eigene Google-Ads-Kampagnen
Das ist keine Monetarisierung. Es ist nur die Messung von Buchungen: `VITE_GOOGLE_ADS_PURCHASE_LABEL` ist gesetzt.

### 3. Awin (Partnerprogramme)
- Nur der Bestätigungs-Tag ist live: `<meta name="verification" …>`.
- **Im Code und in der Datenbank gibt es keine Partner-ID, keine freigegebenen Werbepartner, keine Partnerlinks und keine Banner.** Die Datenbank hat auch keine Tabelle für Werbe-, Partner- oder Einstellungsdaten.

### 4. Eigenwerbung
- `src/components/AdBanner.tsx` („Ihre Werbung … ab 29 € netto / Monat“) verlinkt nur auf /werbung. Das ist **keine Drittanbieter-Werbung**.
- Die Seite /werbung verkauft Flächen am Transporter.

### Ausschluss in sensiblen Schritten
`src/components/BookingSection.tsx` Z. 1088:
`useSuppressAds(step >= 3 || showCheckout || paid || drivePhase !== null)`

Damit ist Werbung ab Fahrzeugwahl, bei Verifizierung, Registrierung, Zahlung, Bestätigung und aktiver Fahrt unterdrückt. Checkout, Admin und die Server-Schnittstellen enthalten keine Werbeflächen.

### Aussehen der Startseite heute
Logo, „Buche deinen Transporter“, Schritte 1–7, Kalender. Unten liegt der Cookie-Hinweis, oben links der Hinweis „App installieren“. Auf Desktop und Handy ist keine Werbung zu sehen.

## Nicht prüfbar: Freigaben bei Google und Awin
- Ob Google die Website in AdSense freigegeben hat und das Konto Anzeigen ausspielen darf.
- Ob die Einwilligungsabfrage von Google (Datenschutz und Nachrichten, EU-Mitteilung nach TCF) im AdSense-Konto erstellt und veröffentlicht ist.
- Ob das Awin-Konto freigeschaltet ist und welche Werbepartner zugesagt haben.

## Kleinste sichere Änderungen (erst nach deiner Bestätigung der Freigaben)

**Schritt A – AdSense, nur wenn Google die Seite freigegeben hat:**
1. Im AdSense-Konto unter „Datenschutz und Nachrichten“ die EU-Einwilligungsabfrage veröffentlichen (das machst du bei Google).
2. Im Code nur in `src/lib/adsense.ts` diese Schalter umstellen: `siteApproved`, `certifiedCmpConfigured` und `enabled` auf true.
3. Live-Test auf mytransporter.org: Zustimmen, Ablehnen, Widerruf. Erst danach auch `liveCmpVerified` auf true setzen und veröffentlichen.
4. Den Cookie-Hinweis und die Datenschutzerklärung um „Werbeanzeigen (Google AdSense)“ ergänzen.

**Schritt B – Awin, nur wenn Partner freigegeben sind:**
Du nennst die Partner-ID und die freigegebenen Partnerlinks. Dann werden sie als gekennzeichnete Links („Anzeige“) auf passenden Seiten eingebaut. Sie laden erst nach Einwilligung und nie im Buchungsablauf.

**Optional:** Auf dem Handy gibt es derzeit keine Werbefläche. Eine zusätzliche Fläche im Seiteninhalt (vorgesehen als `inlineContent`) bräuchte eine neue Werbeeinheit aus dem AdSense-Konto.

Nicht angefasst werden: Buchung, Safari-Scan, Zahlung, Kalender-Abgleich.
