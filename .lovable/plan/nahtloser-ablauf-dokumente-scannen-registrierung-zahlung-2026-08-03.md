# Nahtloser Ablauf: Dokumente scannen → Registrierung → Zahlung

## Ziel
Wer noch kein Konto hat, kann Ausweis und Führerschein direkt scannen (ohne Login), klickt auf "Weiter", registriert sich, ist sofort eingeloggt und landet ohne Umwege bei der Zahlung. Kein "Nicht angemeldet"-Fehler mehr.

## Neuer Ablauf im Buchungsbereich
```text
1 Datum → 2 Uhrzeit & Tarif → 3 Fahrzeug & Zubehör
→ 4 Verifizierung (Ausweis + Führerschein, Vorder-/Rückseite)
→ 5 Registrierung (oder Login)  ← wird übersprungen, wenn schon eingeloggt
→ 6 Bezahlen (15-Min-Reservierung startet hier)
→ 7 Fahrt
```
- Verifizierung kommt jetzt VOR der Registrierung.
- Wer bereits eingeloggt und verifiziert ist, sieht beide Schritte nicht.
- Wer eingeloggt ist, aber Dokumente fehlen, sieht nur die Verifizierung.

## Dokumente zwischenspeichern
- Ohne Login werden die 4 Fotos lokal auf dem Gerät zwischengespeichert (überlebt ein Neuladen der Seite).
- "Weiter" ist erst aktiv, wenn alle 4 Aufnahmen (Ausweis vorne/hinten, Führerschein vorne/hinten) vorliegen; jede Aufnahme bleibt einzeln neu aufnehmbar.
- Direkt nach erfolgreicher Registrierung werden die Fotos automatisch hochgeladen und dem neuen Konto zugeordnet; danach wird der lokale Zwischenspeicher gelöscht.
- Schlägt ein Upload fehl, erscheint ein Hinweis mit "Erneut versuchen" – die Fotos bleiben erhalten.

## Registrierung & Sofort-Login
- Konten werden künftig automatisch bestätigt: nach "Registrieren" ist man sofort eingeloggt (kein Klick auf einen Bestätigungslink mehr nötig).
- Statt der Bestätigungsmail erhält der Kunde eine Willkommens-E-Mail über den bestehenden E-Mail-Versand; die Admin-Benachrichtigung (E-Mail + Push) bleibt unverändert.
- Der Zwischenschritt "Bitte E-Mail bestätigen" inklusive "Erneut senden" entfällt im Buchungsablauf.
- Nach Registrierung: Upload der Dokumente → automatisch weiter zur Zahlung, gewählte Daten (Datum, Uhrzeit, Tarif, Zubehör) bleiben erhalten.

## Zahlung
- Die 15-Minuten-Reservierung startet erst beim Betreten des Zahlungsschritts (wie bisher), also nach der Registrierung – die Zeit läuft nicht während des Scannens/Registrierens ab.
- Das Verifizierungs-Gate vor dem Stripe-Checkout bleibt: es prüft weiterhin die 4 gespeicherten Dokumente des Kontos.

## Technische Umsetzung
- `src/components/DocumentScanner.tsx`: optionaler "Pending"-Modus – statt Upload zu Supabase werden Aufnahmen über einen Callback nach außen gegeben; Upload-Logik bleibt für eingeloggte Nutzer erhalten.
- Neu `src/lib/pending-documents.ts`: Speichern/Laden/Löschen der 4 Blobs in IndexedDB plus Upload-Funktion (Storage `user-documents` + Zeilen in `user_documents`) nach dem Login.
- `src/components/BookingSection.tsx`: Schrittreihenfolge und Stepper-Titel neu ordnen (Verifizierung vor Registrierung), Weiter-Logik, Übersprung-Logik für eingeloggte Nutzer, Upload-Trigger nach Signup, Hold-Trigger auf den neuen Zahlungsschritt umhängen, "E-Mail bestätigen"-Zustand entfernen.
- Auth-Einstellung: E-Mail-Auto-Bestätigung aktivieren (`auto_confirm_email`).
- Willkommens-E-Mail in `src/lib/booking-emails.functions.ts` ergänzen und beim Signup auslösen.
- `src/routes/profil.tsx` bleibt funktional; die Verifizierungssektion dort wird nicht verändert.
