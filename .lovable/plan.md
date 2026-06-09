Do I know what the issue is? Ja.

Der Fehler kommt nicht mehr von der Admin-Rolle selbst. Der Upload wird mit Überschreiben-Modus (`upsert`) abgeschickt. Dafür braucht der Backend-Speicher zusätzlich einen Lesezugriff auf die Objekt-Zeile. Genau diese Lese-Regel für Admins wurde früher entfernt, damit niemand den Fahrzeug-Bucket auflisten kann. Dadurch blockiert die Sicherheitsregel den Upload mit „new row violates row-level security policy“.

Plan:
1. Backend-Speicher-Regel korrigieren
   - Eine gezielte Leseregel für angemeldete Admins im Fahrzeug-Speicher hinzufügen.
   - Upload, Ersetzen und Löschen bleiben weiterhin nur für Admins erlaubt.
   - Öffentliche Fahrzeugbilder bleiben über ihre Bild-URL sichtbar, aber normale Besucher bekommen keine Admin-Rechte.

2. Upload-Code entschärfen
   - Den Fahrzeugfoto-Upload in `VehiclesAdmin` so ändern, dass neue eindeutig benannte Fotos nicht mehr unnötig mit `upsert` hochgeladen werden.
   - Damit reicht für neue Fotos die normale Upload-Erlaubnis, und der Speicher muss nicht erst eine vorhandene Datei prüfen.

3. Fehleranzeige verbessern
   - Statt Browser-Alert eine klare Admin-Meldung anzeigen, damit der echte Fehler sichtbar bleibt und nicht wieder in einem generischen Popup versteckt wird.

4. Danach prüfen
   - Die aktiven Speicher-Regeln abfragen.
   - Den Upload im Admin-Bereich erneut testen bzw. anhand der Netzwerkantwort prüfen, dass kein RLS-Fehler mehr zurückkommt.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>