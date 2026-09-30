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
