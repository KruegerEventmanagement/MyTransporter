# Technischer QA-Check der veröffentlichten MyTransporter-Kundenstrecke

## Umfang und Sicherheitsgrenzen

- Ausschließlich lesende Prüfung von Code, Konfiguration, Logs und Produktionsdaten; keine Code-, Einstellungs- oder Deployment-Änderungen.
- Die veröffentlichte Seite `mytransporter.org` wird in echten Browser-Simulationen geprüft.
- Für die ausdrücklich gewünschte Registrierungsstrecke wird ein eindeutig gekennzeichnetes QA-Konto mit synthetischen, nicht personenbezogenen Dokumentbildern verwendet. Dadurch entstehen technisch notwendige Testdaten im Produktivsystem; es werden keine echten Kundendaten benutzt und keine Zahlung ausgelöst.
- Stripe wird nur bis zur eingebetteten Test-/Zahlungsansicht geprüft. Es werden keine Kartendaten eingegeben und keine echte Zahlung abgeschlossen.

## Prüfablauf

### 1. Buchung und Preisweitergabe
- Startseite in der veröffentlichten Version öffnen und Datum, Uhrzeit, Tarif, Fahrzeug und optionale Pakete durchlaufen.
- Netzwerkanfragen und Browser-Konsole auf Fehler prüfen.
- Sichtbare Preise mit der zentralen Preislogik und den serverseitig erzeugten Stripe-Positionen vergleichen.
- Fahrzeugbezogene Verfügbarkeit, inaktive Fahrzeuge und die 15-Minuten-Reservierung anhand von UI, Code und aktuellen Produktionsdaten prüfen.

### 2. Registrierung und Login
- Pflichtfelder, Passwortregeln, Mindestalter, Fehlerzustände und Ladezustände automatisiert prüfen.
- Ein neues QA-Konto über die veröffentlichte Buchungsstrecke anlegen und kontrollieren, ob Registrierung, Sofort-Login, Dokumentübertragung und Weiterleitung ohne Hänger funktionieren.
- Auth- und Serverlogs zeitlich mit dem Testlauf abgleichen; insbesondere 401/500, Timeouts und Session-Rennen prüfen.

### 3. Dokumente und Kamera
- Alle vier Dokumentfelder mit synthetischen Bildern durchlaufen: Ausweis vorne/hinten und Führerschein vorne/hinten.
- Kamera-Berechtigung, `getUserMedia`, Rückkamera-Anforderung, Vorschau, Übernehmen, erneute Aufnahme, lokales Puffern, Upload und serverseitiges Vier-Dokument-Gate prüfen.
- Kontrollieren, ob alternative Datei-Uploads und mobile `accept`-/`capture`-Attribute tatsächlich vorhanden und nutzbar sind.
- Nach jedem Foto Sichtbarkeit, Aktivierung und Klickbarkeit des „Weiter“-Buttons messen.

### 4. Mobile und responsive Darstellung
Automatisierte Browserläufe mindestens für:

- iPhone SE: 375 × 667
- iPhone 14/15 Pro: 393 × 852
- iPhone Pro Max: 430 × 932
- Samsung/Android kompakt: 360 × 800
- Samsung/Android groß: 412 × 915
- Desktop als Kontrollansicht: 1280 × 1800

Dabei prüfen:
- horizontales/vertikales Abschneiden und Überlappungen,
- Kamera-, Vorschau- und Registrierungsdialoge,
- `100vh`/`100dvh`, Safe Areas, feste Ebenen und z-index,
- Scroll-Locks und Rückkehr aus Overlays,
- simulierte kleine Viewport-Höhen für eingeblendete Tastatur,
- Position und Erreichbarkeit aller „Weiter“-/Bestätigungs-Schaltflächen.

### 5. PWA und Installation
- Live-Manifest, Head-Tags, Icons, MIME-Typen, Größen, `start_url`, `scope`, `id`, Standalone-Modus und HTTPS prüfen.
- Service Worker separat als Push-Worker bewerten; keine Offline-Funktion voraussetzen.
- Chromium-Installierbarkeitsprüfung und `beforeinstallprompt`-Verhalten durchführen.
- iOS-A2HS-Metadaten und Installationsanleitung per Code und Browser prüfen.
- Bereits bestätigten Verdacht verifizieren: `icon-512.png` ist aktuell als JPEG kodiert, obwohl Manifest und Dateiendung PNG angeben.

### 6. Zahlung ohne Belastung
- Authentifiziert bis zur eingebetteten Stripe-Zahlungsansicht gehen.
- Session-Erstellung, Fahrzeug-/Tarif-Metadaten, Betrag, Pakete, Rabattlogik und getrennte 200-€-Kaution prüfen.
- `return_url`, Rückkehr-Polling, Erfolgsanzeige und fehlende/ungültige Session-ID sicher testen.
- Webhook-Code auf Signaturprüfung, ausschließlich bezahlte Sessions, Buchungszuordnung und idempotente PaymentIntent-Verarbeitung prüfen.

### 7. Nach Zahlung und Konfliktschutz
- Vorhandene automatisierte Tests für Fahrzeugzeiträume, Parallelversuche, Statusbehandlung und `booking_actions` ausführen.
- Aktuelle Produktionsdaten lesend auf doppelte PaymentIntents, überlappende aktive Buchungen, offene Holds sowie fehlgeschlagene/steckengebliebene Folgeaktionen prüfen.
- Codepfad für Buchung `paid`, Fahrzeugblockierung, Gutschein-Einlösung, Rechnung, Kundenmail, Adminmail und Retry-Verhalten nachvollziehen.
- Keine neue Zahlung erzeugen; echte End-to-End-Zahlungsbestätigung als notwendiger externer Test kennzeichnen.

### 8. Technische Qualität
- TypeScript-Prüfung, Produktionsbuild und vorhandene passende Tests ausführen.
- Veröffentlichte Browser-Konsole, Netzwerkfehler und verfügbare Server-/Auth-/Webhook-Logs prüfen.
- Offensichtliche Race Conditions zwischen Registrierung, Dokumentupload, Hold, Checkout und Webhook dokumentieren.

## Ergebnisbericht

Der Abschluss enthält:

| Punkt | Status | Prüfart | Konkrete Fundstelle | Ergebnis/Risiko |
|---|---|---|---|---|
| 1–8 | OK / WARNUNG / FEHLER | automatisiert / Code & Config / echtes Gerät erforderlich | Datei:Zeile oder Live-Endpunkt | kurze Fakten |

Zusätzlich:
- priorisierte Fehlerliste nach kritisch/hoch/mittel/niedrig,
- genaue Zeitpunkte und HTTP-Status relevanter Live-Fehler,
- klare Kennzeichnung dessen, was nur mit physischem iPhone/Samsung, echter Kamera oder echter Stripe-Zahlung abschließend beweisbar ist,
- keine Kundendaten, Zugangsdaten oder Geheimnisse im Bericht.
