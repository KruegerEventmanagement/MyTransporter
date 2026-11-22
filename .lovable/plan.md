# Kundenfotos im Admin-Bereich gut sichtbar machen

## Befund (geprüft)
- Die Fotos sind vollständig gespeichert, heute zum Beispiel ein kompletter Satz vor und nach der Fahrt sowie Tankbelege.
- Im Kundenprofil liegen sie unter "Mietverlauf" in Buchungen, die zugeklappt sind. In der geschlossenen Zeile steht nicht, ob es Fotos gibt.
- Nachgereichte Fotos landen fälschlich unter "Fahrzeug vor der Fahrt".

## Änderungen
1. **Fotozähler an jeder Buchung:** In der geschlossenen Zeile steht zum Beispiel "23 Fotos" oder "Keine Fotos".
2. **Buchungen mit Fotos von allein offen:** Die neueste Buchung mit Fotos ist beim Öffnen des Kunden schon aufgeklappt.
3. **Fotovorschau sofort sichtbar:** Auch zugeklappt zeigt die Buchung eine Reihe kleiner Vorschaubilder.
4. **Eigene Gruppe "Nachgereicht":** Fotos, die später hochgeladen wurden, stehen in einer eigenen Gruppe.
5. **Keine Fotos:** Statt nichts steht dort "Für diese Buchung wurden keine Fotos hochgeladen".

## Technische Details
- Nur `src/routes/admin.tsx` (Mietverlauf) wird geändert: Zähler aus dem vorhandenen `photos`-State, Startwert für `openBooking` (neueste Buchung mit Fotos), Vorschaustreifen und neue `PhotoGroup` für `additional`.
- Speicher, Zugriffsrechte, Kundenseite und Pflichtfotos bleiben unverändert.
