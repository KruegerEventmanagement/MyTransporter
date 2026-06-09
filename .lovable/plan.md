## Ziel

Zwei optionale Zusatzpakete als echte Add-Ons in den Buchungsflow integrieren (Auswahl, Bezahlung, Speicherung, Anzeige) und zusätzlich eine schöne Marketing-Sektion auf `/ueber-uns` unter den Tarifen einbauen.

## Pakete (zentrale Quelle der Wahrheit)

Neu: `src/lib/addons.ts`
- `sicher_transport` – „Sicher-Transport Paket", 19 €, Badge „Beliebtestes Zusatzpaket"
- `profi_umzug` – „Profi-Umzug Paket", 49 €, Badge „Bester Komfort"
- Inhalte, Beschreibung und Button-Text exakt wie vom User vorgegeben.

So bleibt es eine Quelle, die UI, Checkout, DB-Snapshot und Admin nutzen.

## 1. Neuer Schritt im Buchungsflow ("Zusatzpakete")

In `src/components/BookingSection.tsx`:

- Neuen Step „Zusatzpakete" zwischen aktuellem Step 2 (Fahrzeug) und Bezahlung einfügen.
  - Stepper-Titel werden um „Zubehör" erweitert.
  - Step-Indizes verschieben sich um 1 (alle `setStep`-Aufrufe + Conditional-Renderings entsprechend angepasst).
- State: `const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([])`. Mehrfachauswahl möglich; beide Pakete können kombiniert werden. Optional bleibt „weiter ohne Zubehör" erlaubt.
- UI: zwei große Karten (mobil-optimiert), Badges, Inhaltsliste (Check-Icons), Preis, Toggle-Button „Paket hinzufügen" / „Hinzugefügt – entfernen".
- Unter den Karten: Hinweistext (Verfügbarkeit / Rückgabe / Ersatzkosten) + Vertrauenshinweis (genau die vom User formulierten Texte).
- Gesamtbetrag (`total`) wird neu berechnet:  
  `total = plan.price + DEPOSIT + Summe(addons.price)`  
  Wird in der Summary auf Step Fahrzeug, Zubehör und Bezahlen angezeigt, mit Aufschlüsselung „Miete + Zubehör + Kaution".

## 2. Stripe-Checkout um Add-On-Line-Items erweitern

`src/lib/payments.functions.ts` → `createBookingCheckout`:
- Neue Eingabe `addonIds: string[]` (validiert gegen `addons.ts`).
- Für jedes gewähltes Add-On ein zusätzliches `line_item` (Name + Preis aus zentraler Definition).
- `metadata.addonIds` mitspeichern (für Webhooks / Debugging).

In `BookingSection` werden `addonIds` beim Start des Checkouts mit übergeben und zusammen mit Preis/Label in `mt_pending_booking` (localStorage) abgelegt.

## 3. DB-Migration: Add-Ons auf der Buchung speichern

Neue Felder auf `public.bookings`:
- `addons jsonb not null default '[]'` – Snapshot `[{ id, label, price_cents }]`
- `addons_total_cents integer not null default 0`

(Keine separate Tabelle, weil der Inhalt sich pro Buchung nicht ändert und so der Audit-Snapshot stabil bleibt.)

## 4. Buchung anlegen mit Add-Ons

`src/routes/checkout.return.tsx`:
- `pending` um `addons` (Array `{id, label, priceCents}`) erweitern.
- Beim `bookings.insert` zusätzlich `addons` und `addons_total_cents` setzen.
- E-Mail-Bestätigung (`booking-emails.functions.ts`): Add-Ons-Block in die Buchungsbestätigung aufnehmen (Liste + Summe).

## 5. Anzeige in relevanten Bereichen

- `src/routes/buchung.$bookingId.tsx` (Kundenansicht der Buchung): Block „Gebuchtes Zubehör" mit Inhalt der Pakete + Erinnerungshinweis (Vollständige & unbeschädigte Rückgabe).
- `src/routes/trip.$bookingId.tsx` (während der Fahrt) und `src/components/ScheduledTripView.tsx`: kompakte Liste der gebuchten Pakete, damit der Fahrer weiß, was im Transporter dabei ist.
- `src/components/ReturnFlow.tsx`: vor Finish ein Hinweisscreen „Bitte Zubehör vollständig zurückgeben" mit Liste; Pflicht-Checkbox „Zubehör vollständig & unbeschädigt zurückgegeben".
- `src/routes/admin.tsx`: in der Buchungsliste/Detailansicht die gebuchten Add-Ons + `addons_total_cents` anzeigen (für Vorbereitung der Übergabe).

## 6. Marketing-Sektion auf /ueber-uns

Neu: `src/components/AddonPackagesSection.tsx`
- Überschrift „Praktische Zusatzpakete für deinen Transport" + Unterüberschrift wie vorgegeben.
- Zwei Karten (gleiche Komponente wie im Buchungs-Step, ohne Auswahl-State), Badges „Beliebtestes Zusatzpaket" / „Bester Komfort".
- Hinweistext + Vertrauenshinweis (exakt die vom User gelieferten Texte).
- Mobile-first: Single Column auf Mobil, 2-Spalten ab `md`, lesbare Typo (Fredoka, schwarz/weiß/grau gemäß Design-Memory – keine Farb-Akzente).
- Einbindung in `src/routes/ueber-uns.tsx` direkt unter `<TariffSection />`.

## 7. Konsistenz / Designsystem

- Strikt Schwarz/Weiß/Grau, Buttons schwarz mit weißer Schrift, abgerundete Karten wie restliche Sektionen.
- Karten responsiv (`grid-cols-1 md:grid-cols-2 gap-6`), Inhaltsliste mit `lucide-react` Check-Icons.

## Technischer Überblick (für später)

- Neue Datei: `src/lib/addons.ts` (typed const + Helper `getAddonById`, `sumAddonsCents`).
- Migration: ergänzt `addons jsonb`, `addons_total_cents int` auf `bookings`.
- Edits: `BookingSection.tsx`, `payments.functions.ts`, `checkout.return.tsx`, `booking-emails.functions.ts`, `buchung.$bookingId.tsx`, `trip.$bookingId.tsx`, `ScheduledTripView.tsx`, `ReturnFlow.tsx`, `admin.tsx`, `ueber-uns.tsx`.
- Neu: `src/components/AddonPackagesSection.tsx` (+ optional `AddonPackageCard.tsx` für Wiederverwendung in Buchungs-Step und Marketing-Sektion).
