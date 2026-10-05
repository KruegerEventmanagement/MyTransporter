# Laufende Fahrt: stabile Fahrtansicht, Rückkehr-Leiste, Rückgabeentwurf

Ausgang: e1841ee. Keine Änderungen an Preisen, Stripe, Kalender, Awin, echten Kunden/Buchungen/Mails. Kein Deployment.

Der Auftrag ist sehr groß und betrifft kritische Abläufe. Darum wird er in vier Pakete geteilt. Jedes Paket endet mit grünen Tests, Typecheck und Build, dann folgt das nächste.

## Paket 1 – Aktive Miete und Rückkehr-Leiste
- `src/lib/active-trip.ts` (rein, testbar): Auswahl der aktiven Miete (`active`, `returning` plus bestehende Fahrtstatus aus `BLOCKING_BOOKING_STATUSES` ab Abholung). Bei mehreren Mieten gewinnt die gerade geöffnete ID, danach die frühere Startzeit. Schlüssel immer nach Nutzer und Buchung.
- `src/hooks/useActiveTrip.ts`: liest nur eigene Buchungen (RLS + `user_id`). Neu laden bei Seitenwechsel, Fokus, Online und pageshow. Realtime-Kanal mit 60-s-Polling als Rückfall. Bei Netzfehler bleibt der letzte Stand erhalten. Abmelden oder Kontowechsel leert den Stand sofort. Keine Supabase-Aufrufe im Auth-Callback.
- `ActiveTripBanner` in `__root.tsx`: schwarze, voll klickbare Leiste mit weißem Text „Sofort zurückkehren“. Beachtet die Safe Area und erscheint nicht in `/trip/*`.
- Logo-Link zur Startseite in einer schlanken Fahrt-Kopfzeile. Diese ist auch in Vollbildkarte und Rückgabe sichtbar.
- `trip.$bookingId.tsx`: Zeitlimit beim Laden mit Fehlermeldung und Retry, kein Endlos-Spinner. `start_km` 0 bleibt gültig. Phase kommt aus dem Serverstatus. `onReturn` bleibt bei Reload erhalten. Nach dem Login führt die Rückkehr zur angeforderten Fahrt.

## Paket 2 – Zeiten und Karte
- `src/lib/trip-time.ts`: Start und Ende aus gespeicherten Feldern (`start_date`, `start_hour`, `plan_id` über `plan_end_at`/`local_start_at`, Berlin-Zeit). Langzeit und Verlängerungen werden berücksichtigt, soweit die Felder existieren; das Schema wird vorher gelesen. Der Laufzeitzähler beginnt nie neu. Erinnerung ab `endAt − 10 min`, wird bei Fokus oder Online nachgeholt. Eine frühere Rückgabe ist immer möglich.
- Fehler in `ActiveTripDashboard.tsx`, die behoben werden:
  - „Nicht jetzt“ startet keine Standortabfrage mehr und fragt danach nicht erneut automatisch.
  - Es gibt keinen erfundenen Standort.
  - Die Karte räumt beim Verlassen auf. Veraltete Routenantworten werden verworfen.
  - Die Routenwahl nutzt den richtigen Index nach dem Sortieren.
  - Ziel, Route und Navigationsansicht werden pro Nutzer und Buchung gespeichert.
  - Bei Karten- oder Routenfehlern gibt es Text und Retry; die Rückgabe bleibt nutzbar.
- Die Rückgabe-Checkliste ist während der Fahrt sichtbar, mit dem Hinweis „Sobald du sicher geparkt hast“.

## Paket 3 – Rückgabeentwurf und Foto-Warteschlange
- `src/lib/return-draft.ts`: Entwurf nach Nutzer und Buchung in localStorage, mit Zeitstempel. Neuere Stände werden nie überschrieben. Gesichert werden Schritt, Kilometer, Tank, Ausnahmegründe und Code.
- `src/lib/photo-queue.ts`: Fotos liegen als Blobs in IndexedDB mit stabiler Upload-ID. Vorhandene Speicherpfade werden über `saveTripPhoto({uploadedPath})` weiterverwendet. Wiederholung bei Online und per Knopf, sicher bei mehreren Aufrufen. Ist IndexedDB nicht verfügbar, sagt die App das ehrlich und lädt direkt online hoch.
- `ReturnFlow.tsx`: neue Aufnahme `post_fuel`. Die acht Außenansichten und der Innenraum bleiben. Anzeige pro Foto: „Auf diesem Gerät gespeichert“, „Wird übertragen“ oder „Übertragen“ mit Retry. Bestätigte Fotos vom Server werden zusammengeführt. Dazu kommt der vorgegebene Dokumentationstext und ein konsistenter Hinweis vor Fahrtbeginn.

## Paket 4 – Rückgabemeldung auf dem Server und Push
- `createServerFn reportReturn` (mit `requireSupabaseAuth`):
  - Prüft Eigentum und Status.
  - Prüft die bestätigten Fotokategorien oder einen begründeten Ausnahmefall.
  - Verwendet einen vorhandenen `return_code` wieder.
  - Funktioniert idempotent bei Doppelklick oder verlorener Antwort.
  - Endstand 0 ist erlaubt. Ein kleinerer Endstand als der Start wird zur manuellen Prüfung markiert und nicht mit 0 berechnet.
  - Keine automatische Kautionsabbuchung. Ein Ausnahmegrund meldet sich über die bestehenden `admin_notifications`.
- Migration nur, wenn nötig. Dann additiv und mit nullable Spalten: `return_reported_at`, `return_review_reason`, `end_km_manual`, `return_reminder_10min_sent_for`. Die letzte Spalte speichert die Endzeit, damit nach einer Endzeitänderung erneut erinnert wird.
- Erinnerung per Push: Ein neuer Abschnitt im bestehenden `send-reminders`-Hook wählt nach dem aktuellen Ende aus und nutzt die vorhandenen `push_subscriptions`. Authentifizierung und Cron bleiben unverändert, es gibt keine Testsendungen. Kunden aktivieren Push nur per Klick.
- `public/sw.js`: Ein Klick auf die Benachrichtigung öffnet exakt `/trip/<UUID>` auf derselben Domain; Admin-URLs funktionieren weiter. Es gibt keine Zwischenspeicherung privater Seiten oder API-Antworten. Höchstens eine statische Offline-Hinweisseite für Navigationen ohne Netz.

## Validierung
- Gezielte Tests zu Auswahl, Fremdkonto, Kontowechsel, cancelled und completed, Zeit-Resolver (Berlin, Sommerzeit, früh, spät, geänderte Endzeit), Routenindex, abgelehntem GPS, Karten-Unmount, Entwurf, Warteschlange (offline, Reload, doppelt), `reportReturn` (Idempotenz, Code-Wiederverwendung, 399999-Fall) und Service-Worker-URL.
- Bestehende Kameratests bleiben.
- Gesamte Testsuite, `tsgo` und `bun run build` mit einzeln geprüften Exitcodes.
- Playwright bei 390 px und 1280 px mit Mock-Daten.
- Belege in `docs/qa-active-trip-2026-10-05.md`. Keine Behauptung physischer iPhone-Tests.

## Annahme
Die Pakete werden nacheinander in mehreren Durchläufen umgesetzt. Nach jedem Paket kommt ein kurzer Zwischenbericht, damit der Diff prüfbar bleibt.
