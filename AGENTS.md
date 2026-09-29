# AGENTS

- Kamera/Foto-Helfer liegen in src/lib/image-capture.ts; alle Aufnahmen nutzen sie, damit kein stiller null/0-px-Fehler entsteht.
- Fahrtfotos speichern über src/lib/trip-photo-store.ts (Upload + bestätigter DB-Eintrag, signierte Vorschau); trip-photos.ts bleibt für bestehende Leser.
- Komponententests laufen mit jsdom per Datei-Kommentar und vollständig gemockten Diensten aus src/test/.
