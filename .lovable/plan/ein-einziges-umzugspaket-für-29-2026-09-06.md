# Ein einziges Umzugspaket für 29 €

Aus den beiden bisherigen Zusatzpaketen (Sicher-Transport 19 €, Profi-Umzug 49 €) wird ein einziges Paket.

## Das neue Paket

- Name: **Umzugspaket**
- Preis: **29 € pro Buchung**
- Inhalt:
  - 2 dicke Spanngurte
  - 4 dünne Zurrgurte
  - 1 neue Rolle Klebeband / Panzertape
  - 1 Paar Arbeitshandschuhe
  - 5 Umzugsdecken für Möbeltransport

Das zweite Paket verschwindet komplett – es ist nicht mehr auswählbar und wird nirgends mehr angezeigt.

## Wo sich das auswirkt

- Startseite / Marketing-Abschnitt „Zusatzpakete“: zeigt nur noch dieses eine Paket, mittig statt zweispaltig.
- Buchungsablauf: nur noch eine Auswahlkarte, Preisberechnung 29 €.
- Bestätigungen, Rechnungen und Adminansicht übernehmen automatisch den neuen Namen und Preis.
- Bereits bestehende Buchungen behalten ihre gespeicherten alten Pakete und Preise – Belege bleiben korrekt.

## Technisch

- `src/lib/addons.ts`: `AddonId` auf `"umzugspaket"` reduzieren, `ADDONS` auf einen Eintrag (29 €, neue Inhaltsliste, Badge z. B. „Praktisches Zusatzpaket“). Hilfsfunktionen (`getAddonById`, `sumAddonsCents`, `buildAddonSnapshot`) bleiben unverändert und funktionieren weiter; unbekannte alte IDs werden bereits ignoriert.
- `src/components/AddonPackagesSection.tsx`: Grid auf eine Karte mit `max-w-md mx-auto`; Einleitungstext leicht auf Singular angepasst.
- Buchungs-UI (`BookingSection.tsx`) rendert über `ADDONS`, braucht daher nur Layout-Prüfung.
- Danach Typecheck und Build.
