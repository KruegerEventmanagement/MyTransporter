# Pflicht-Hinweis Rückgabefotos direkt nach der Zahlung

## Ziel
Gleich nach einer erfolgreichen Zahlung sieht der Kunde einen auffälligen Hinweis: Rückgabefotos sind Pflicht, sonst droht eine Bearbeitungsgebühr von 30 €.

## Was gebaut wird
1. **Pop-up auf der Fahrtseite direkt nach der Zahlung**
   - Die Zahlungsseite leitet nach wenigen Sekunden auf die Fahrtseite weiter. Dort öffnet sich einmalig ein Fenster:
     - Titel: „Wichtig: Rückgabefotos sind Pflicht“
     - Text: „Fehlen nach der Fahrt die Rückgabefotos, droht eine Bearbeitungsgebühr von 30 €.“
     - Kurze Fotoliste (Tankbeleg, Tacho mit Kilometerstand und Tankanzeige, Innenraum, Laderaum, außen alle vier Seiten).
     - Knopf „Verstanden“ (schwarz, weiße Schrift).
   - Erscheint pro Buchung nur einmal, nicht bei jedem Öffnen.
2. **Zahlungsseite selbst**: Der bestehende Hinweiskasten bekommt oben eine fette Zeile „Rückgabefotos sind Pflicht – sonst droht eine Bearbeitungsgebühr von 30 €“, damit er auch beim kurzen Warten sofort auffällt.

## Grenzen
- Keine Änderung an Preisen, Zahlung, Kaution oder Rückgabe-Ablauf. Die 30 € werden weiterhin nie automatisch abgebucht.
- Keine Mails, kein Veröffentlichen.

## Technische Details
- Weiterleitung in `checkout.return.tsx` hängt `?neu=1` an `/trip/$bookingId` (validateSearch dort ergänzen).
- Neue Komponente `PostPaymentPhotoNotice` (shadcn Dialog), Texte aus `src/lib/return-notice.ts` (`RETURN_PHOTO_LIST`, neue Konstante `POST_PAYMENT_PHOTO_NOTICE`); Anzeige nur bei `neu=1` und wenn `localStorage` `mt_postpay_notice_<id>` fehlt; Lesen in `useEffect`.
- Kleiner Test: Anzeige-Logik (einmal pro Buchung) und Text enthält „30 €“; Typecheck/Build.
