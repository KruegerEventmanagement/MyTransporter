# QA: Reduktion der zeitabhängigen Inklusivkilometer um ein Drittel (30.09.2026)

Basis: HEAD 6469c1b / 05c98722. Nicht veröffentlicht. Keine echten Zahlungen, Buchungen oder Mails; keine DB-Änderung.

## Tabelle alt → neu (alle Klassen L1H1 / L4H2 / L5H2 identisch; Mietpreise unverändert)

| Tarif (interne ID) | alt km | neu km | L1H1 € | L4H2 € |
|---|---|---|---|---|
| 3 h (3h) | 100 | 67 | 49 | 59 |
| 6 h (6h) | 200 | 133 | 69 | 79 |
| 24 h Umzugstag (24h_300, ID bleibt) | 300 | 200 | 99 | 109 |
| 24 h Langstrecke (24h_500) | 500 | 500 (unverändert, bezahltes Paket) | 189 | 199 |
| 24 h Fernstrecke (24h_800) | 800 | 800 (unverändert, bezahltes Paket) | 299 | 309 |
| 2 Tage | 600 | 400 | 189 | 209 |
| 3 Tage | 900 | 600 | 269 | 299 |
| 4 Tage | 1200 | 800 | 339 | 379 |
| 5 Tage | 1500 | 1000 | 399 | 449 |
| 6 Tage | 1800 | 1200 | 449 | 509 |
| 7 Tage | 2100 | 1400 | 499 | 569 |
| week_xN | 2100·N | 1400·N | unverändert | unverändert |
| Langzeitmodell (separat, rabattiert) | round(4000/30·d) | round(4000/30·d·2/3) | Anker 999/1399/1699 unverändert | |

Langzeit: 7 d 622, 14 d 1244, 30 d 2667, 45 d 4000, 60 d 5333 (erst am Ende gerundet). Das Standard-Wochenpaket (1.400 km) ist bewusst NICHT das Langzeitkontingent (622 km für 7 d). Unverändert: Mehrkilometersätze 0,45/0,35/0,29, Langzeitstaffeln 0,29/0,22/0,18, Gutschrift 0,05 € max. 10 %, Kaution 200 €, reiner km-Tarif 0,90 €/Mindestbeträge.

## Schutz bestehender Buchungen / Checkouts

- DB-Bestand gelesen: alle `bookings.free_km` sind gesetzt (NOT NULL), z. B. 24h_300=300, multi_2d=600. Diese Werte werden unverändert weiter genutzt; keine Buchung verändert.
- Leser: Rückgabe (ReturnFlow) nutzt jetzt `bookingFreeKm(planId, storedFreeKm)` – gespeicherter Wert strikt (0 gültig); nur ohne Snapshot Legacy-Katalog (`LEGACY_FREE_KM`), nie der neue. Admin-Nachberechnung, Rechnungs-PDF, Buchungsdetail und Trip-Seite lesen bereits `free_km`/`km_price_cents` der Buchung.
- Checkout (`payments.functions.ts`): Stripe-Metadata enthält jetzt serverseitig `kmCatalog=km-2026-09-30`, `freeKm`, `kmPriceCents`.
- Webhook: `resolveCheckoutKmSnapshot` – gültiger aktueller Snapshot → genau diese Werte; Session ohne/mit alter Version (vor Änderung gestartet) → Legacy-Kontingent (z. B. 3 Tage 900, 24h 300). Idempotenz/Action-State-Machine unverändert.
- Interne IDs (24h_300, week_xN, Aliase 24h/24h_short/24h_long) bleiben; sichtbarer Kurztext zeigt „24 h · 200 km“.

## Aktualisierte Anzeigen

booking-rules (Katalog, Kommentar), long-term, Preise/TariffSection/BookingSection/Umzugs- und Pforzheim-Seite (dynamisch), FAQ (2 Texte), AGB-Tarifliste (+ Stand 30.09.2026, Altbuchungen behalten bestätigte km), AdvantagesSection (200 km; vorher fehlerhaft „1.500 km Wochenmiete“ → 1.400), Tausenderpunkt auf Preiskarten. Nicht ersetzt: 100 km/h-Drossel, 500/800-km-Pakete, CompareSection „bis 800 km“.

## Ausgeführte Tests

- `bun run test`: 26 Dateien, 311 Tests bestanden (neu: jede Klasse × Tarif km+Preis, 24h 200/300 km → 99/144 €, 3 d 600/900 km → 269/374 € (105 € Mehr-km), 30/45/60 d Basis + Wunsch-km (2500 → 990,65 €, 4000 → 1362,26 €, 5000 → 1582,26 €, 0 → 899,10 €), Legacy-Auflösung, alte vs. neue Webhook-Session, Altbuchung 3 d/900 und 24h/300 ohne Zusatzkosten, gespeicherte 0 km).
- Typecheck grün, Produktionsbuild grün.
- Browser lokal 375 px und 1280 px: /preise, /faq, /langzeitmiete, /agb zeigen neue km, keine alten 300/900-Texte, keine Seitenfehler.

## Nicht geprüft

Echter Stripe-Checkout/Webhook-Lauf (nur Unit-Tests), Buchungsbestätigungs- und Admin-Mails live, Galerie/Badge/Auth nur über bestehende Regressionstests, Live-Domain (nicht veröffentlicht), echtes iPhone.

## Nachtrag: Alter Browser-Tab
Der Browser sendet beim Checkout `kmCatalog` (KM_CATALOG_VERSION). Der Server prüft vor jedem neuen Checkout mit `checkoutKmCatalogError`; fehlt die Version oder ist sie veraltet (alter Tab mit 300/900 km), wird keine Session erzeugt und die Meldung „Tarife wurden aktualisiert. Bitte Seite neu laden und die aktuellen Konditionen prüfen.“ angezeigt. Die Version ist kein Preis-Input; Kilometer/Preise rechnet weiterhin der Server. Bereits existierende Stripe-Sessions sind unberührt (Webhook: Snapshot bzw. Legacy). Tests in rental-quote.test.ts; kein echter Checkout/keine Mail ausgeführt.

## Nachtrag: Textpräzisierung AGB

Der AGB-Hinweis lautete zuvor „Für Buchungen vor diesem Datum gelten die bei Buchung bestätigten Freikilometer.“ Das war missverständlich, weil auch bereits vor der Veröffentlichung abgeschlossene Buchungen ihre alten Werte behalten. Neu: „Für bereits abgeschlossene Buchungen gelten unverändert die bei der Buchung bestätigten Freikilometer und Mehrkilometersätze.“ Der Stand „30. September 2026“ bleibt, es gibt keine Datums- oder Mitternachtsgrenze und keine inhaltliche AGB-Änderung. Der Km-Snapshot-Bestand (bookings.free_km, Stripe-Metadata) und die Altbuchungsauflösung sind unberührt.

## Nachtrag: Mehrkilometer einheitlich 0,45 €
Eigentümerauftrag: Mehrkilometer bei Rückgabe kosten jetzt bei allen Tarifen und Klassen 0,45 €/km (vorher 0,35 € bei 2–6 Tagen, 0,29 € ab 7 Tagen/Langzeit). Unverändert: im Voraus hinzugewählte Langzeit-km (0,29/0,22/0,18), Gutschrift, Mietpreise, Kontingente. KM_CATALOG_VERSION → km-2026-09-30b, damit alte Tabs mit 0,35/0,29 € keinen Checkout mehr starten. Sessions aus km-2026-09-30 behalten ihren Snapshot (z. B. 600 km/0,35 €); Sessions ohne Version erhalten Legacy-km und Legacy-Satz (LEGACY_EXTRA_KM_CENTS). Gespeicherte Buchungen (km_price_cents) unverändert. 315 Tests bestanden.
