# Zahlung für Kunden, die sich vorher registriert haben

## Was die Daten zeigen
- In den letzten 3 Wochen haben 17 Kunden erfolgreich gebucht. Fast alle haben sich während der Buchung registriert.
- 5 Kunden haben sich registriert und nie gebucht: Faisal Popalzai (heute 13:29 angemeldet), Ralf Stoll, Alexandre Soares, Simone Diao, Dirk Adler.
- Keiner dieser 5 hat jemals einen Ausweis oder Führerschein hochgeladen. Bei ihnen ist nicht einmal ein Upload-Versuch angekommen.
- Bei Ralf Stoll fehlt außerdem die Handynummer.
- Speicher und Berechtigungen für Ausweisfotos sind in Ordnung.

Die genaue Ursache ist damit noch nicht bewiesen. Verdächtig sind: das Hochladen der Ausweisfotos, wenn man schon angemeldet ist (anderer Weg als bei der Registrierung in der Buchung), und die Pflichtangaben-Prüfung vor dem Bezahlknopf.

## Plan
1. **Nachstellen wie ein echter Kunde:** Test-Konto über "Registrieren" oben im Menü anlegen, abmelden, wieder anmelden, Transporter wählen, Ausweis und Führerschein hochladen (Handy-Ansicht, Galerie-Bild) und bis zum Bezahlknopf gehen. Dazu derselbe Ablauf mit Dokumenten, die vorher im Profil hochgeladen wurden. Bezahlen bis zur Test-Zahlung mit Stripe-Testkarte.
2. **Jeden gefundenen Fehler beheben**, z. B.:
   - Ausweis-Upload hängt oder scheitert still bei angemeldeten Kunden: klare Fehlermeldung, Erneut-versuchen, Upload mit Zeitlimit.
   - Bereits hochgeladene Dokumente werden nicht erkannt: Dokumente aus dem Profil zählen sofort, Kunde muss nichts doppelt machen.
   - Bezahlknopf grau ohne Grund: sichtbar anzeigen, was noch fehlt (wie bei der Kaution), z. B. "Handynummer fehlt", "Haftung bestätigen".
3. **Test**, der den Ablauf "erst registrieren, später buchen" absichert.
4. Die 5 betroffenen Kunden nenne ich dir, damit du sie anrufen kannst. Ich schreibe niemanden an.

## Bleibt unverändert
Preise, Stripe-Abrechnung, Doppelbuchungsschutz, Bestätigungsmails, automatische Kontobestätigung, Registrierung während der Buchung.

## Technische Details
- Prüfen: `BookingSection.tsx` (`verified`, `basicsOk`, Disabled-Bedingung Zeile ~2386), `CustomerBasicsGate`, `DocumentScanner` im Modus `upload`, `runBookingCheckout` serverseitig.
- Playwright mit `--create-test-user`, mobile Viewport, Stripe-Sandbox-Karte 4242.
