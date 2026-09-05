# Fix: Ausweis-/Führerschein-Foto wird beim Registrieren nicht gespeichert

## Was der Kunde erlebt
Beim Buchen ohne Konto fotografiert er Ausweis und Führerschein, tippt auf „Übernehmen" – und die Aufnahme wird nicht übernommen. Stattdessen erscheint „Bitte erneut scannen", der „Weiter"-Knopf bleibt grau und er kommt nicht zur Registrierung und Buchung.

## Ursache (Stand der Prüfung)
Vor der Registrierung werden die vier Fotos ausschließlich in der lokalen Gerätedatenbank des Browsers zwischengespeichert. Klappt dieses Speichern nicht – typisch bei Safari im privaten Modus, wenig freiem Speicher, blockierten Website-Daten oder älteren iPhone-Browsern –, wird der komplette Schritt als Fehler behandelt und die Aufnahme verworfen. Es gibt heute keinen Ersatzweg und keine verständliche Meldung. Die Berechtigungen für das späteren Hochladen ins Konto sind korrekt geprüft und in Ordnung, das ist nicht die Fehlerquelle. Ob im Einzelfall zusätzlich noch etwas anderes hakt, wird der Testdurchlauf zeigen.

## Was geändert wird
1. **Aufnahme geht nie mehr verloren:** Jedes Foto wird sofort im laufenden Sitzungsspeicher gehalten. Das Zwischenspeichern auf dem Gerät ist nur noch ein zusätzlicher Komfort für „Seite neu laden", kein Muss mehr. Scheitert es, läuft der Ablauf trotzdem weiter.
2. **Speicherformat robuster:** Fotos werden in einem Format abgelegt, das auch ältere iPhone-/Safari-Versionen zuverlässig annehmen; als zweite Rückfallebene ein platzsparend komprimiertes Ablegen im normalen Browserspeicher.
3. **Weiter-Knopf richtet sich nach dem, was wirklich vorliegt:** Sobald alle vier Aufnahmen (Ausweis vorne/hinten, Führerschein vorne/hinten) im Ablauf vorhanden sind, ist „Weiter" aktiv – unabhängig davon, ob das Gerät sie dauerhaft merken konnte.
4. **Verständliche Hinweise statt „Bitte erneut scannen":** Ein echter Kamerafehler bleibt als Fehler; ein reines Speicherproblem erzeugt nur einen dezenten Hinweis („auf diesem Gerät nicht dauerhaft gemerkt – bitte Buchung in diesem Fenster abschließen").
5. **Nach der Registrierung:** Die Fotos werden wie bisher automatisch dem neuen Konto zugeordnet; schlägt das Übertragen fehl, gibt es eine klare Meldung mit „Erneut versuchen", und die Aufnahmen bleiben erhalten, statt den Ablauf zu blockieren.

## Prüfung nach der Umsetzung
Ein echter Durchlauf im Browser mit Testdaten: Fotos aufnehmen (simulierte Kamera) → alle vier übernehmen → „Weiter" → Registrieren → landet im Zahlungsschritt mit Übersicht; zusätzlich derselbe Durchlauf mit absichtlich blockiertem Gerätespeicher, um zu belegen, dass es dann ebenfalls funktioniert. Ergebnis wird berichtet.

## Technische Umsetzung
- `src/lib/pending-documents.ts`: Speicherschicht mit drei Ebenen – In-Memory-Map (führend), IndexedDB (`ArrayBuffer` statt `Blob`), `localStorage`-Fallback (komprimiertes JPEG als Data-URL, Größenbegrenzung). Alle Schreibpfade werfen nicht mehr nach außen, sondern melden Erfolg/Teilerfolg; `listPendingDocumentTypes` vereinigt alle drei Quellen; `uploadPendingDocuments` liest aus der jeweils vorhandenen Quelle und räumt nach Erfolg alle drei auf.
- `src/components/DocumentScanner.tsx`: `confirmUpload` unterscheidet Kamera-/Upload-Fehler (Phase `rejected`) von Persistenz-Warnungen (Fortsetzen mit Hinweis); `isComplete`/`frontAlreadyDone` werden per Effekt mit den Props synchronisiert, damit der interne Zustand nicht von einer veralteten Initialisierung abhängt.
- `src/components/BookingSection.tsx`: `pendingDocTypes` wird aus dem Callback-Ergebnis geführt (Quelle unabhängig), `guestDocsComplete`/`docsReady` darauf basierend; Hinweisbanner für „nicht dauerhaft gespeichert"; `flushPendingDocuments` behält Retry und blockiert den Sprung zu Schritt 5 nicht dauerhaft.
- Verifikation per Playwright gegen `localhost:8080` mit `--use-fake-device-for-media-stream` sowie ein Lauf mit deaktiviertem IndexedDB/localStorage; abschließend Typecheck und Produktionsbuild.
