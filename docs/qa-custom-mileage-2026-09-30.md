# QA – Individuelles Kilometerpaket (30.09.2026, nicht veröffentlicht)

Preisstand: Eigentümerentscheid „Überall 0,45 €“ (Katalog km-2026-09-30b) für Vorab-Zusatzkm und Rückgabe-Mehrkm aller Standardtarife. Langzeit-Vorabstaffeln 0,29/0,22/0,18 € + Gutschrift 0,05 € (max 10 %) unverändert; Langzeit-Rückgabe 0,45 €. Kein Satz vom Kunden wählbar.

## Dateien
- Preislogik (rein, deterministisch): src/lib/custom-km.ts
- UI: src/components/CustomKmCard.tsx, src/components/BookingSection.tsx (Draft speichert Option + Rohtext)
- Checkout-Snapshot: src/lib/payments.functions.ts (nur desiredKm vom Browser, Klasse aus DB-Fahrzeug, eigene Stripe-Position, Metadata ck*, Coupon nur Grundmiete, Storno-Erstattung inkl. Paket)
- Webhook: src/routes/api/public/payments/webhook.ts (free_km/km_price_cents/addons aus Snapshot, ungültiger Snapshot → Admin-Hinweis, keine Buchung)
- Rückgabe/Mail/Rechnung: ReturnFlow.tsx, booking-emails.server.ts, invoice-pdf.server.ts (Paket kurz, Tarifdetail in zweiter Zeile)
- Tests: src/lib/custom-km.test.ts (inkl. gemockter Checkout→Webhook→Buchung→Rückgabe), src/lib/invoice-km.test.ts

## Beispiele (L1H1, getestet)
24h: 200=99 · 300=144 · 400=189 (500er) · 503=190,35 · 700=279 · 800=299 · 803=300,35
3d: 600=269 · 900=404 (Paket 135 €) · 1200=539; L4H2 3d 900=434, Crafter 450
7d: 1400=499 · 2000=769. Rückgabe bei 900 vorab: 900 km = 0 €, 901 = 0,45 €. Kaution 200 € immer separat.

## Browser (localhost, keine Writes)
Desktop 1280 + 375 px: Karte bedienbar, 503 km auf 3h → Aufschlag 196,20 €, Miete 245,20 €; „12,5“, „-3“, „30001“ → Fehler, Zahlen-Button gesperrt; Abwählen → Originaltarif 49 € + 200 € Kaution.

## Rechnung (gemockte Fiktivdaten, kein DB-Eintrag/Mail)
docs/qa-custom-mileage-invoice-mock.png: 99 + 29 (Umzugspaket) + 91,35 (Kilometerpaket 503 km) = 219,35 € + 200 € Kaution; keine Überlappung.

## Nicht geprüft
Echter Stripe-Checkout/Webhook, echte Mails, echte Stornoerstattung, iPhone-Gerät, Reload-Wiederherstellung nach echter Registrierung (nur Draft-Logik + lokaler Browser).

## Nachtrag Review 3a996fdf (30.09.2026)
1. Leeres/Leerzeichen-Feld = kein Paket, kein Fehler, Hinweis „Keine zusätzlichen Kilometer ausgewählt“; Kraftstoffhinweis und alle km-Zusammenfassungen zeigen das gebuchte Kontingent.
2. Versionierter Entwurf (sessionStorage `mt_booking_draft`, v1, 24 h, nur Auswahl): einmal beim Einstieg wiederherstellen, erst danach speichern; höchstens bis „Fahrzeug & Zubehör“, Reservierung entsteht später neu; vergangene Daten/abgelaufene Entwürfe verworfen; beim Start der Zahlung gelöscht; Speicherfehler abgefangen.
3. Mit Paket: Checkout verlangt genau ein aktives DB-Fahrzeug mit dem Kennzeichen, sonst klarer Fehler ohne Stripe-Sitzung; Browserklasse/-name werden ignoriert. plan_id/Hold unverändert.
4. Snapshot `ckm-2` (≤17 + Zubehörzeilen Keys, Werte ≤500 Zeichen): Tarif/Klasse/Label, Grundmiete vor Rabatt, Rabatt, Zubehörzeilen, Paketbetrag, Kontingent, Satz, Kaution, Gesamtsumme. Webhook (`src/lib/booking-persist.ts`) übernimmt ihn ohne Katalog und prüft Summe gegen `amount_total`/`eur`. ck-Feld ohne ckV, `ckm-1`, Summen-/Betragsabweichung → ungültig (Admin-Hinweis, Stripe-Retry). Sessions ohne ck* → bisheriger Pfad.
5. Echte Handlerlogik getestet: `src/lib/booking-checkout.server.ts` (von `createBookingCheckout` genutzt) + `resolveBookingPricing`, gemocktes Stripe/Backend: `src/lib/booking-checkout.test.ts` (7 Fälle: 503+Umzugspaket+Gutschein, Katalogänderung danach, 3 d 900 → 404 € + 200 €, 900/901 km, falsches/inaktives/doppeltes Fahrzeug, Klasse aus DB, defekte Snapshots/falscher Betrag/Währung, ohne Paket, alte Session 35 ct).
6. Browser localhost (1280 und 375 px, zwei Kalendertage → 24 h, 09:00, L1H1 LEO MY 102): 503 → Aufschlag 91,35 € (über 24 h · 500 km), Miete 190,35 €, Kaution 200 €, 503 km gebucht; Neuladen → identische Werte, Fahrzeug und „503 km inklusive“; leeren → 200 km, 99 €, nicht gesperrt; „12,5“ → gesperrt; aus → Originaltarif. Keine Holds/Zahlungen/Mails. Bild: docs/qa-custom-mileage-375-reload.png.

Offen: echter Stripe-Lauf, echte Mails/Erstattung, iPhone-Gerät; Wiederherstellung nach E-Mail-Bestätigung weiterhin über den bestehenden Registrierungsentwurf (nicht erneut im Browser geprüft).

## Nachtrag 19:58
Tarifzeile im Fahrzeugschritt zeigt Miete inkl. Paket (503 km → „190,35 € Miete inkl. Kilometerpaket“; leer/aus → „99 € Miete“, 200 km), lokal geprüft. Kaution wird aus resolveBookingPricing in bookings.deposit geschrieben (Paket: Snapshot-Wert; bisheriger Pfad: 200 €); Test mit abweichendem Snapshot-Betrag (150 €).
