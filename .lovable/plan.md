# Foto-Bestätigung beim Scannen + Dokumenten-Übersicht im Profil

## 1. DocumentScanner: Foto-Vorschau mit Bestätigung

Ablauf pro Seite (Vorderseite → Rückseite von Ausweis bzw. Führerschein):

1. Countdown wie bisher, Bild wird aufgenommen.
2. **Neu:** Statt sofort hochzuladen, zeigt der Scanner das aufgenommene Bild als Vollbild-Vorschau an.
3. Zwei Buttons unter dem Bild:
   - „Erneut aufnehmen" → verwirft, zurück zur Kamera.
   - „Übernehmen" → lädt das Bild jetzt in `user-documents` hoch und speichert die Zeile in `user_documents`.
4. Nach Übernahme: bei Vorderseite → weiter zur Rückseite, bei Rückseite → Scanner geht in den „verified"-Zustand.
5. **Neu:** Im „verified"-Zustand (kompakter Button in der Profil-Ansicht) zeigt der Scanner zusätzlich einen kleinen Text-Link/Button „Erneut aufnehmen" darunter, der die vorhandenen Dateien und Zeilen für diesen `documentType` löscht und den Flow neu startet.

Änderungen in `src/components/DocumentScanner.tsx`:
- Neuer Phase-State `preview` mit Canvas-Blob im `useState`.
- `runCapture` teilt sich in `captureFrame` (Canvas → Blob → `preview`) und `confirmUpload` (Upload + DB-Insert).
- „Verified"-Button bekommt zweiten kleinen Aktions-Slot: „Erneut aufnehmen" ruft neue Prop `onReset(documentType)` auf; Parent löscht Storage-Objekte + DB-Zeilen und ruft `loadDocs`.

## 2. Profil: Dokumenten-Übersicht mit Löschen

Neue Sektion „Meine Dokumente" in `src/routes/profil.tsx`, sichtbar sobald mindestens ein Dokument hochgeladen ist. Zeigt pro hochgeladenem `doc_type` (`id_front`, `id_back`, `license_front`, `license_back`):

- Thumbnail (Signed URL aus `user-documents`, analog zu bestehendem Admin-Flow).
- Label (Ausweis Vorderseite / Rückseite, Führerschein Vorderseite / Rückseite).
- Upload-Datum.
- Button „Löschen" → entfernt Datei aus `user-documents` und Zeile aus `user_documents` (nur für eigenen User via RLS). Danach `loadDocs`.

Wichtig: Für den Admin bleibt eine Kopie erhalten — der User löscht nur aus seiner eigenen Sicht? Nein, der User-Wunsch ist klar: **der Nutzer darf löschen, beim Admin bleibt die Aufnahme aber für immer**. Umsetzung:

- Neue Spalte `deleted_by_user_at timestamptz` auf `user_documents` (Migration).
- User-„Löschen" setzt nur `deleted_by_user_at = now()` (Soft-Delete). Storage-Objekt bleibt.
- Profil-Query blendet Zeilen mit gesetztem `deleted_by_user_at` aus (User sieht sie nicht mehr, kann Dokument neu aufnehmen).
- Admin-Ansicht (`admin.tsx`) zeigt weiterhin alle Zeilen, inkl. gelöschter — Markierung „vom Nutzer entfernt" bei gesetztem Timestamp.
- RLS-Policy für UPDATE auf `user_documents` (User darf eigene Zeile updaten) prüfen/ergänzen.

## 3. Fahrten- & Kosten-Übersicht

Die bestehende Profil-Seite enthält bereits Statistiken (Fahrten, Ausgegeben, Kilometer, Fahrzeuge), aktive Buchung, anstehende Fahrten und komplette Historie — dieser Teil ist damit inhaltlich schon vorhanden. Ich lasse ihn unverändert, außer die neue Dokumenten-Sektion sinnvoll darüber/darunter zu platzieren.

## Betroffene Dateien

- `src/components/DocumentScanner.tsx` — Preview-Phase, `onReset`-Prop, „Erneut aufnehmen" im verified-Zustand.
- `src/routes/profil.tsx` — neue Dokumenten-Sektion (Thumbnails, Löschen, Reset-Handler).
- `src/routes/admin.tsx` — Anzeige gelöschter User-Dokumente mit Kennzeichnung.
- Neue Migration: Spalte `deleted_by_user_at` auf `user_documents` + UPDATE-Policy für den Besitzer.

## Technische Details

- Signed URLs für `user-documents`-Thumbnails via `supabase.storage.from("user-documents").createSignedUrl(path, 3600)`.
- Soft-Delete-Ansatz stellt sicher, dass Admin-Nachweise für Vermietungs-Compliance nicht durch den Nutzer entfernt werden können.
- Kein Auto-Upload mehr direkt nach Countdown: erst nach „Übernehmen" landet das Bild in Cloud/Storage.
