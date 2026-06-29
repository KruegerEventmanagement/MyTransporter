# Verifizierungs-Gate vor der Bezahlung

## Ziel
Eine Person kann erst bezahlen, wenn Ausweis (Vorder- + Rückseite) und Führerschein (Vorder- + Rückseite) hochgeladen sind. Die gewählte Zeit/Fahrzeug-Kombi wird beim Erreichen des Verifizierungs-Schritts für **15 Minuten** reserviert. Nach erfolgreichem Scan geht's automatisch weiter zur Bezahlung. Erinnerungs-E-Mails (Abholcode, Fahrtbeginn) laufen weiter wie bisher.

## Ablauf im Booking-Flow
Neuer Schritt **„Verifizierung"** wird zwischen „Fahrzeug & Zubehör" und „Bezahlen" eingeschoben — aber nur, wenn der eingeloggte User noch keine 4 Dokumente in `user_documents` hat. Wer schon verifiziert ist, überspringt den Schritt komplett (kein zusätzlicher Klick).

Stepper neu:
- Nicht eingeloggt: Datum → Uhrzeit/Tarif → Fahrzeug → Registrierung → **Verifizierung** → Bezahlen → Fahrt
- Eingeloggt, unverifiziert: Datum → Uhrzeit/Tarif → Fahrzeug → **Verifizierung** → Bezahlen → Fahrt
- Eingeloggt, verifiziert: wie bisher (kein Extra-Schritt)

Im Verifizierungs-Schritt:
- Zwei `DocumentScanner`-Karten (ID + Führerschein, wie auf `/profil`)
- Großer Countdown „Reservierung läuft in **mm:ss** ab"
- Sobald beide Dokumente komplett sind → automatisch weiter zu „Bezahlen"
- Läuft der Timer ab, bevor Bezahlung gestartet wurde: Hinweis „Reservierung abgelaufen", Schritt zurück auf „Uhrzeit & Tarif", Slot wird wieder frei (Reservierung wird gelöscht)

## 15-Minuten-Reservierung (technisch)
Neue Tabelle `booking_holds`:
- `vehicle_id`, `start_date`, `start_hour`, `plan_id`, `user_id`, `expires_at` (= jetzt + 15 min)
- Eindeutigkeit: aktive Hold pro `(vehicle_id, start_date, start_hour)` blockt andere Holds und Buchungen
- RLS: User darf eigene Hold sehen/löschen; Admin/Service Role alles
- GRANTs für `authenticated` + `service_role`

Verfügbarkeitslogik (`src/lib/availability.functions.ts`) berücksichtigt zusätzlich aktive, nicht abgelaufene Holds anderer User → Slot ist während der 15 min für andere blockiert.

Hold wird angelegt, sobald der Verifizierungs-Schritt betreten wird (oder direkt vor Stripe-Checkout, falls schon verifiziert) und beim erfolgreichen Bezahlen/Stornieren wieder entfernt. Abgelaufene Holds werden serverseitig beim nächsten Verfügbarkeits-Check ignoriert; ein leichter Cleanup-Cron (täglich) räumt alte Zeilen weg.

## Bezahlung serverseitig absichern
`createBookingCheckout` (in `src/lib/payments.functions.ts`) bekommt zwei zusätzliche Prüfungen:
1. User hat in `user_documents` alle vier `doc_type`-Einträge (`id_front`, `id_back`, `license_front`, `license_back`). Sonst Fehler „Bitte zuerst Ausweis und Führerschein hochladen".
2. Es existiert eine eigene, noch gültige `booking_holds`-Zeile für genau dieses Fahrzeug+Datum+Stunde. Sonst Fehler „Reservierung abgelaufen, bitte Zeit neu wählen".

Damit ist das Gate auch dann dicht, wenn jemand die UI umgeht.

## UI-Hinweise außerhalb des Buchungsflows
- Auf `/profil` bleibt das bisherige Banner; Wording wird klarer: „Ohne hochgeladenen Ausweis und Führerschein kannst du keine Buchung abschließen."
- Erinnerungs-E-Mails (Abholcode etc.) bleiben unverändert.

## Technische Details (für später)
- Migration: `booking_holds` (Tabelle + GRANTs + RLS + Index auf `(vehicle_id, start_date, start_hour, expires_at)`), Cleanup-Funktion `delete from booking_holds where expires_at < now()` als pg_cron-Job 1× täglich.
- Server-Fns: `createBookingHold`, `releaseBookingHold`, beide mit `requireSupabaseAuth`; `getAvailability` erweitert um Hold-Check.
- Client: neuer `step === 3.5`-Zustand wird sauber als eigener `step`-Index abgebildet (Stepper-Mapping in `BookingSection.tsx` anpassen), Countdown via `setInterval`, Auto-Advance wenn beide Doc-Typ-Paare vollständig sind.
- Sicherheitscheck in `createBookingCheckout`: SELECT auf `user_documents` (RLS auf eigenen User) und auf `booking_holds`.