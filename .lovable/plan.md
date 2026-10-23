# Buchungszeitraum mit Beginn und Ende anzeigen

## Ziel
Überall im Admin, wo eine Buchung nur mit Startdatum und Startuhrzeit steht (z. B. Mietverlauf im Kundenprofil: „24.10.2026 · 10:00 · Code 4EZAJD“), steht künftig der komplette Zeitraum:

```text
Sa 24.10.2026, 10:00 – Sa 24.10.2026, 16:00 Uhr · 6 Std.
Code 4EZAJD
```

Bei Mehrtagesmieten entsprechend z. B. „Sa 24.10., 09:00 – So 25.10.2026, 09:00 Uhr · 1 Tag“.

## Umfang
- Mietverlauf im Admin-Kundenprofil (Screenshot).
- Weitere Admin-Buchungslisten/-details mit gleicher Startzeit-Only-Anzeige (Buchungsliste, Kalenderdetails, Kautionsansicht), soweit vorhanden.
- Kunden-Ansichten (Profil „Meine Buchungen“, Abholbildschirm) ebenfalls mit Ende ergänzen.
- Nur Anzeige: keine Änderung an Buchungen, Preisen, Mails oder Verfügbarkeit.

## Technisches
- Neue kleine Formatfunktion `formatBookingRange` auf Basis von `resolveTripWindow` (src/lib/trip-time.ts, Spiegel von `plan_end_at`), Berliner Zeit, damit das Ende überall identisch zur Verfügbarkeit ist; km-Tarif endet 22:00.
- Ersetzt die Zeile in src/routes/admin.tsx (~1167) und gleichartige Stellen (per `rg start_hour` gefunden).
- Test: 6h ab 10:00 → „10:00 – 16:00“, 24h ab 09:00 → Folgetag 09:00, Sommer-/Winterzeitwechsel 25.10.
- Typecheck/Build, nichts veröffentlichen.
