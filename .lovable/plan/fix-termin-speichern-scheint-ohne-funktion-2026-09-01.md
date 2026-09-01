# Fix: „Termin speichern" scheint ohne Funktion

## Ursache (verifiziert)

Der Button ist korrekt verdrahtet (`onClick={handleSave}` → Server-Funktion `upsertManualReservation`). Das Problem liegt bei den Rückmeldungen: `handleSave` bricht bei fehlenden Angaben mit `toast.error(...)` ab – aber im ganzen Projekt ist **kein Toast-Container gerendert** (Suche nach `Toaster` findet nur die unbenutzte UI-Datei `src/components/ui/sonner.tsx`, deren Export zudem auf `n` verstümmelt ist). Ergebnis: Egal ob Validierungsfehler, Serverfehler oder Erfolg – es passiert sichtbar nichts, der Button wirkt „toter".

Am wahrscheinlichsten greift die Validierung „Bitte ein Fahrzeug auswählen" bzw. „Bitte einen Namen eintragen" oder das Speichern schlägt serverseitig fehl – in beiden Fällen bleibt die Meldung unsichtbar.

## Was ich mache

1. **Toast-Anzeige global aktivieren**: funktionierenden `Toaster` (sonner) einmalig in `src/routes/__root.tsx` einhängen und `src/components/ui/sonner.tsx` auf einen sauberen `Toaster`-Export reparieren. Damit werden alle bestehenden Erfolgs-/Fehlermeldungen im ganzen Adminbereich sichtbar (nicht nur im Kalender).
2. **Formular gibt direkt Feedback**: im Termin-Dialog (`src/components/admin/CalendarAdmin.tsx`) zusätzlich eine Inline-Fehlerzeile über den Buttons anzeigen, unabhängig von Toasts – inklusive der echten Server-Fehlermeldung, falls das Speichern abgelehnt wird.
3. **Speichern absichern**: fehlgeschlagene Speicherversuche werden klar benannt (z. B. fehlende Admin-Rechte, ungültiger Zeitraum) statt still zu scheitern.
4. **Smoke-Test**: als Admin im Kalender einen Termin anlegen, Speichern prüfen, Termin in Tagesliste/„Nächste Termine" bestätigen, anschließend Typecheck/Build.

## Technisch

- `src/components/ui/sonner.tsx`: korrekter `Toaster`-Export (aktuell `export { n }`, was ein Mount unmöglich macht).
- `src/routes/__root.tsx`: `<Toaster />` einmal neben `<Outlet />` rendern.
- `src/components/admin/CalendarAdmin.tsx`: `formError`-State, gesetzt in `handleSave` an allen Abbruchstellen und im `catch`, dargestellt über dem Button-Block; keine Änderung an der Server-/Verfügbarkeitslogik.
