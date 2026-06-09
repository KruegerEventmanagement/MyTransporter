# End-to-End Test: Gesamter MyTransporter-Flow

Ich teste den vollständigen Prozess zweimal — einmal mit deinem bestehenden Account, einmal mit einem neu angelegten Testkonto — und dokumentiere jeden gefundenen Bug.

## Was getestet wird

### Durchlauf 1 — Dein Account
1. **Buchung** auf `/` — Datum, Uhrzeit, Tarif, Fahrzeug auswählen
2. **Bezahlung** mit Stripe-Testkarte `4242 4242 4242 4242`
3. **Buchungsdetails** auf `/buchung/{id}` — Bestätigung prüfen
4. **Pre-Drive-Flow** — Fahrzeugübergabe-Fotos, Kilometerstand-, Tankstand-Foto
5. **KI-Erkennung** prüfen: Wird `km_start` und Tankstand korrekt aus den Fotos ausgelesen und gespeichert?
6. **Aktive Fahrt** auf `/trip/{id}` — Karte, GPS-Tracking, Steuerelemente während der Fahrt
7. **Return-Flow** — Rückgabefotos, Kilometerstand nachher, Tankstand nachher, getankte Liter
8. **Zuordnung prüfen**: `km_end - km_start = gefahrene_km`, Tank-Delta korrekt
9. **Abschluss** — Buchungsstatus, Mail, Kaution

### Durchlauf 2 — Neues Testkonto
- Auth-User per Admin-API anlegen (`test-sim-{ts}@mytransporter.org`)
- Kompletten Flow oben wiederholen
- Zusätzlich: Registrierungs-Trigger (Profile + Admin-Notification) prüfen

## Wie ich teste

- **Browser-Automation** (`browser--act` / `observe`) für UI-Klickpfade, Foto-Uploads (eine echte Test-JPG aus dem Repo wird als File-Input angehängt)
- **DB-Reads** nach jedem Schritt: `bookings`, `trip_photos`, `gps_tracks` — verifiziere dass jede Aktion korrekt persistiert wird
- **Network-Inspector** für Stripe-Session, Server-Functions, Storage-Uploads — jeder 4xx/5xx wird notiert
- **Console-Logs** auf Hydration-/RLS-/Runtime-Fehler scannen
- **Server-Function-Logs** für Backend-Fehler (KI-Bilderkennung, Webhooks)

## Was du am Ende bekommst

Einen strukturierten Report pro Durchlauf mit:
- ✅ funktionierende Schritte
- ⚠️ kosmetische/kleine Probleme
- ❌ Bugs mit genauer Stelle (Datei:Zeile, Fehlermeldung, betroffener DB-State)

**Bugs werden NICHT automatisch gefixt** — du entscheidest pro Bug, ob ich ihn anschließend behebe (das kann je nach Anzahl mehrere Folge-Runden brauchen).

## Nicht im Scope (dieser Runde)
- Bewertungs-Feature (laut deiner Aussage „schauen wir dann noch")
- Performance-/Last-Tests
- Tatsächliche Echtgeld-Zahlungen (nur Stripe-Testmodus)

## Hinweise / Risiken
- **Testdaten bleiben in der DB** (wie gewünscht) — Stripe-Test-Charges, Test-User, Test-Buchungen mit Status „completed"
- **Browser-Foto-Upload-Limitierung**: Komplexe Drag-/Kamera-Widgets funktionieren in der Automation evtl. nicht — dort teste ich den File-Input direkt; falls Kamera-Stream zwingend ist, melde ich das als manuell zu testen
- **KI-Erkennung**: Ich prüfe, ob die Antwort plausibel ist (z. B. Ziffern), aber kann „korrekt" nur gegen das tatsächlich hochgeladene Foto verifizieren — ich nutze Fotos mit bekanntem Kilometerstand/Tank
