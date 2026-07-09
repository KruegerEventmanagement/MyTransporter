## Ziel

Auf der Buchungs-Detailseite (`/buchung/:bookingId`) sollen zusätzlich zu den bereits vorhandenen Trip-Fotos auch die **Ausweis- und Führerscheinfotos** des Kunden angezeigt werden – als reine Ansicht, ohne Löschen-Button.

## Änderungen

### 1. `src/routes/buchung.$bookingId.tsx`
- Neuen State `documents` (Ausweis-/Führerschein-Rows) plus signierte URLs laden.
- Im `useEffect` zusätzlich `user_documents` für den aktuellen User abfragen:
  - `select id, doc_type, photo_url, created_at`
  - `eq user_id`, `is deleted_by_user_at null`
  - Signed URLs aus dem privaten Bucket `user-documents` (1 h) erzeugen.
- Neue Sektion **„Meine Ausweisdokumente"** über oder unter der bestehenden Fotos-Sektion:
  - Gleiches Grid-Design wie die Trip-Fotos (klickbar → gleiche Lightbox).
  - Labels aus `DOC_LABELS` (Personalausweis Vorder-/Rückseite, Führerschein Vorder-/Rückseite).
  - **Kein** Löschen-Button, kein Trash-Icon – nur Ansicht.
  - Hinweis-Text: „Dokumente können nur im Profil bearbeitet werden."
- Falls keine Dokumente vorhanden: Sektion nicht rendern (bleibt sauber).

### 2. Keine Backend-Änderungen
- Bestehende RLS-Policy auf `user_documents` erlaubt dem Besitzer bereits SELECT.
- Bestehender Storage-Bucket `user-documents` (privat) + Signed URLs funktionieren bereits (siehe `profil.tsx`).
- Trip-Fotos sind bereits in dieser Ansicht sichtbar – keine Änderung nötig.

## Nicht Teil der Änderung
- Admin-Ansicht (dort sind alle Fotos schon sichtbar).
- Profil-Seite (Dokumente bleiben dort löschbar wie gewünscht).
- Änderung an Trip-Fotos oder deren Speicherung.
