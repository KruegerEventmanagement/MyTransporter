# Rechnungs-PDF überarbeiten

Alle Änderungen in `src/lib/invoice-pdf.server.ts`. Das hochgeladene Logo (`ChatGPT_Image_6._Mai_2026_22_10_11_-_bearbeitet-2.png`) wird als Lovable-Asset abgelegt und ins PDF eingebettet.

## Änderungen im Header
- Logo oben links statt Text „MyTransporter" (Höhe ~40px, proportional). Wird als Asset via `lovable-assets` hochgeladen und im Server-Handler per `fetch` + `embedPng` geladen.
- `USt-IdNr.: wird ergänzt` → `USt-IdNr.: DE328715703`
- `www.mytransporter.org` → `mytransporter.org` (im Header und im Footer)

## Fahrzeugblock
- Fahrgestellnummer (VIN) ergänzen. Wird aus `vehicles` per `vehicle_plate` nachgeladen und als eigene Zeile unter „Fahrzeug" ausgegeben: `Fahrgestellnummer (FIN): <vin>`. Falls keine VIN vorhanden, Zeile weglassen.

## Kaution / MwSt.-Text
- Zeile unter Kaution `„Umsatzsteuerfrei gemäß § 10 UStG · wird nach beanstandungsfreier Rückgabe vollständig erstattet."` **entfernen**.
- Zeile im Summenblock `„Kaution (umsatzsteuerfrei, § 10 UStG)"` → `„Kaution"`.
- Neuer Hinweisblock „Kaution" unter dem Summenblock:
  - Bei beanstandungsfreier Rückgabe wird die Kaution vollständig erstattet.
  - Bei Schäden, Verschmutzung, fehlendem Tankbeleg oder anderen Vertragsverstößen wird der entstandene Betrag anteilig einbehalten; der Rest wird zurückerstattet.
  - Die Auszahlung kann bis zu einer Woche dauern.

## MwSt.-Hinweisblock
- Zweite Zeile `„Die Kaution ist gemäß § 10 UStG nicht umsatzsteuerbar und wird vollständig erstattet."` **entfernen** (steht künftig im Kautions-Block ohne § 10).

## Technisch
- Neue Datei `src/assets/invoice-logo.png.asset.json` (Asset-Pointer für das hochgeladene Logo).
- Im Server-Handler das Logo lazy per `fetch(logoUrl)` laden, `embedPng`, `page.drawImage(...)`. Fallback: bei Fehler wieder Text „MyTransporter" rendern, damit die Rechnung nie bricht.
- VIN-Lookup: zusätzliche `supabaseAdmin.from("vehicles").select("vin").eq("plate", booking.vehicle_plate).maybeSingle()` neben dem bestehenden Booking-Fetch.

Keine Änderungen an Emailversand, DB-Schema oder anderen Rechnungsdaten.