## Prüfung: Aktueller Zustand deckt die Anforderung bereits ab

Ich habe die drei betroffenen Stellen abgeglichen. Es sind **keine Änderungen** nötig:

### 1. Ausweis-/Führerscheinfotos – Nutzer kann löschen
- **Profilseite (`/profil`)**: In der Sektion „Meine Dokumente" gibt es pro Dokument einen Trash-Button (`deleteDoc`). Dieser setzt `deleted_by_user_at = now()` – **Soft-Delete**, die Storage-Datei bleibt erhalten.
- **Buchungs-Detailseite (`/buchung/:id`)**: Ausweis-/Führerscheinfotos werden angezeigt, **ohne Löschen-Button** – Bearbeitung nur über das Profil (Hinweistext ist bereits vorhanden).

### 2. Autofotos (Trip-Fotos) – nicht löschbar für Nutzer
- Weder auf der Profilseite noch auf der Buchungs-Detailseite existiert eine Lösch-UI für `trip_photos`. Nutzer können sie also nicht entfernen.

### 3. Admin-Bereich – alles bleibt für immer
- Die Admin-Ansicht (`/admin`) filtert `deleted_by_user_at` **nicht** heraus und markiert vom Nutzer entfernte Dokumente mit einem roten „Vom Nutzer entfernt"-Badge. Die Datensätze und Storage-Dateien bleiben unangetastet.
- Trip-Fotos werden ohnehin nie gelöscht.

## Wenn du zusätzlich möchtest

Falls du meinst, dass der Löschen-Button irgendwo aktuell nicht auftaucht oder nicht funktioniert, sag mir bitte konkret, **wo** (z. B. „auf der Buchungs-Detailseite fehlt der Löschen-Button für den Ausweis") – dann passe ich das gezielt an.
