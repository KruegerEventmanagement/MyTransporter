## Ziel
Kompletter End-to-End-Test der MyTransporter-App mit dem bestehenden Testaccount – von Buchung über Fahrt bis Rückgabe – inklusive der neu hinzugefügten Zusatzpakete.

## Vorgehen (Browser-Automation im Preview)

### 1. Vorbereitung
- Preview öffnen, Login mit Testaccount prüfen (falls nicht eingeloggt, User darauf hinweisen)
- DB-Snapshot: Aktuelle Buchungen, Vehicles und Verfügbarkeiten via `supabase--read_query` lesen

### 2. Buchungsflow (Startseite → Checkout)
- Datum/Zeit auswählen
- Schritt 2: Fahrzeug + **Zusatzpaket "Sicher-Transport" (19 €)** auswählen
- Gesamtbetrag prüfen: Miete + Kaution + 19 € Addon
- Stripe-Checkout durchlaufen (Sandbox-Testkarte)
- Rückkehr auf `/checkout/return` → Buchung wird in DB angelegt
- DB-Check: `addons`, `addons_total_cents`, Status, Beträge

### 3. Buchungsdetailseite
- `/buchung/{id}` aufrufen → gebuchte Zusatzpakete sichtbar?
- Bestätigungsmail-Logs prüfen (Resend / server-function-logs)

### 4. Admin-Ansicht
- `/admin` → Buchung sichtbar, Zubehör-Prep-Liste korrekt?

### 5. Pre-Drive-Flow (Übergabe)
- `/trip/{id}` aufrufen → Zubehörliste sichtbar
- Pre-Drive: Kilometerstand erfassen (inkl. AI-Odometer-Erkennung), Fotos
- Status auf "active" / Trip läuft

### 6. GPS-Tracking
- Während aktiver Fahrt: GPS-Punkt simulieren / prüfen ob `gps_tracks` Einträge bekommt
- Karte / Track-Anzeige im Admin

### 7. Rückgabeflow
- `ReturnFlow` öffnen → End-Kilometerstand, Foto, **Pflicht-Checkbox "Zubehör vollständig & unbeschädigt zurückgegeben"**
- Versuch ohne Checkbox → blockiert?
- Mit Checkbox → Buchung abgeschlossen, Status final
- DB-Check: Endkilometer, Differenzen, Status `completed`

### 8. Bug-Report
Nach jedem Schritt: Screenshot + kurze Notiz. Am Ende kompakter Bericht:
- Was funktioniert
- Was hakt (UI/Logik/DB)
- Empfehlungen für Fixes (separat, nicht in diesem Lauf gefixt – außer du sagst explizit "fixen")

## Hinweise
- Destruktive Aktionen (echte Stripe-Live-Zahlungen) werden vermieden – nur Sandbox.
- Falls Login-Wall: ich stoppe und bitte dich, im Preview einzuloggen.
- Falls die Browser-Automation an einer Stelle scheitert (z. B. Stripe-Iframe, Kamera-Upload), berichte ich das ehrlich statt es zu überspielen.
