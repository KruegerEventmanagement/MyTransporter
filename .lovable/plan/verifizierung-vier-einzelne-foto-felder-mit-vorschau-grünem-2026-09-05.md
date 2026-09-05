# Verifizierung: vier einzelne Foto-Felder mit Vorschau, grünem Haken und „Ändern"

## Was der Kunde künftig sieht

Statt zwei Sammel-Buttons („Personalausweis scannen", „Führerschein scannen") gibt es im Verifizierungs-Schritt vier eigene Felder, jeweils als Kachel:

```text
[ Ausweis Vorderseite     ]  ✓
[ Ausweis Rückseite       ]  ✓
[ Führerschein Vorderseite]  ✓
[ Führerschein Rückseite  ]  ✓
```

- Jedes Feld ist einzeln antippbar und öffnet die Kamera nur für genau diese Seite.
- Ist ein Foto gemacht, zeigt das Feld ein kleines Vorschaubild, den Namen der Seite und rechts einen grünen Haken.
- Ein Tipp auf das fertige Feld bzw. auf „Neu aufnehmen" ersetzt genau dieses eine Foto – auch später noch, ebenso im Profil unter „Verifizierung". Es gibt kein Feld mehr, das sich nach dem Speichern nicht mehr ändern lässt.
- Kein zusätzliches „Weiter" innerhalb eines Feldes mehr: nach dem Bestätigen einer Aufnahme schließt die Kamera und man ist zurück in der Liste.
- Der „Weiter"-Knopf des Buchungsablaufs wird aktiv, sobald alle vier Felder einen Haken haben (unverändertes Verhalten dahinter).

Preise, Buchungslogik, Zahlung und das Speichern der Fotos bleiben unverändert – geändert wird nur die Darstellung und die Bedienung der Aufnahme.

## Technische Umsetzung

- `src/components/DocumentScanner.tsx` wird auf eine einzelne Seite umgestellt: neue Props `docType: PendingDocType` (`id_front` | `id_back` | `license_front` | `license_back`), `label`, `isComplete`, `previewUrl?`, `onCapture`, `onReset`. Der interne Zwei-Seiten-Zustand (`side`, `frontDone`, `frontAlreadyDone`) und die daran hängenden Sync-Effekte entfallen; `confirmUpload` speichert genau eine Seite und geht danach direkt in `verified` zurück (Kamera schließen, `onComplete`).
- Neue Kachel-Darstellung im Idle/Verified-Zustand: Thumbnail (Object-URL des gepufferten Blobs bzw. signierte URL des gespeicherten Dokuments), Titel, rechts `CheckCircle` in Grün (nur dieser Haken darf grün sein; restliches Monochrom-Design bleibt), Aktion „Neu aufnehmen" immer verfügbar, wenn ein Foto vorliegt.
- `src/lib/pending-documents.ts`: kleine Ergänzung `getPendingDocumentUrl(docType)` (Object-URL aus dem vorhandenen In-Memory/IndexedDB/localStorage-Blob) für die Vorschau der Gast-Aufnahmen. Speicher-/Upload-Logik unverändert.
- `src/components/BookingSection.tsx` (Schritt 3 und der bestehende Block um Zeile 1515): rendert vier `DocumentScanner`-Kacheln über `PENDING_DOC_TYPES`; `onCapture` ruft weiterhin `handlePendingCapture`, `onReset` löscht für Gäste `deletePendingDocument(docType)` und für eingeloggte Nutzer die Zeile in `user_documents` (Soft-Delete `deleted_by_user_at`, wie im Profil) und lädt danach neu. `docsReady`/`guestDocsComplete` bleiben unverändert.
- `src/routes/profil.tsx`: gleiche vier Kacheln; `resetDocType` wird auf einzelne `doc_type`-Werte umgestellt (`resetDocSide(docType)`), damit einzelne Seiten nachträglich ersetzbar sind. Der Bereich „Meine Dokumente" bleibt.
- Vorschau-URLs für gespeicherte Dokumente über die bereits genutzten signierten Storage-URLs; Aufräumen der Object-URLs per `useEffect`-Cleanup.

## Prüfung

Typecheck und Produktionsbuild; Playwright-Durchlauf mit simulierter Kamera gegen `localhost:8080`: vier Felder einzeln aufnehmen, Haken prüfen, ein Feld erneut aufnehmen und bestätigen, dass „Weiter" aktiv bleibt und der Ablauf bis zur Registrierung/Zahlung führt.
