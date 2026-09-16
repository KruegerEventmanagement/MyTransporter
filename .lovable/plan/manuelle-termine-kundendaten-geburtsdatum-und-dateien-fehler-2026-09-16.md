# Manuelle Termine: Kundendaten, Geburtsdatum und Dateien + Fehler beim Angebot/Rechnung

## 1. Fehler beim Erstellen von Rechnung/Angebot (sofort behoben)

Ursache: Im Feld „Preis je weiterer km" (und „Freikilometer") wird ein Komma erlaubt, z. B. `0,90`. Beim Erzeugen des PDFs wird daraus keine gültige Zahl, und die Prüfung bricht mit dem angezeigten Fehlertext ab.

Behebung: Komma wird automatisch als Dezimaltrennzeichen akzeptiert, und wenn ein Feld keine sinnvolle Zahl enthält, wird es einfach als „nicht angegeben" behandelt statt einen Fehler zu werfen. Gleiches gilt für die Betragsfelder der Positionen. Statt eines technischen Fehlercodes erscheint künftig immer eine klare deutsche Meldung.

## 2. Manueller Termin: vollständige Kundendaten

Im Terminformular des Admin-Kalenders kommen dazu (alle optional außer Name):

- Geburtsdatum (Datumsfeld, iPhone-taugliches Eingabefeld, kein zukünftiges Datum) – im Termin und in der Terminliste wird zusätzlich das Alter angezeigt
- Adresse: Straße, PLZ/Ort
- Ausweisnummer / Führerscheinnummer (Freitext, optional)

Das Geburtsdatum ist optional, damit du auch Werkstatt- oder Reservierungstermine ohne Kundendaten weiter schnell eintragen kannst. Für Marketingzwecke wird es, wenn vorhanden, gespeichert und in der Terminübersicht angezeigt.

## 3. Dateien zum Termin hinzufügen

Im Terminformular ein Bereich „Dokumente (optional)": Ausweis Vorder-/Rückseite, Führerschein Vorder-/Rückseite und beliebige weitere Dateien – jeweils Foto aufnehmen oder Datei auswählen (Handy und Desktop). Nach dem Speichern erscheinen die Dateien als Miniaturen am Termin, sind einzeln öffnenbar und einzeln löschbar. Die Dateien liegen im geschützten Dokumentenspeicher und sind nur für Admins über zeitlich begrenzte Links sichtbar – nie öffentlich.

## Technische Umsetzung

**Migration (eine):**
- `public.manual_reservations` erhält neue Spalten: `customer_birth_date date`, `customer_street text`, `customer_city text`, `customer_id_number text`, `customer_license_number text` – alle nullable, bestehende Zeilen bleiben unverändert.
- Neue Tabelle `public.manual_reservation_documents` (`reservation_id` → `manual_reservations(id) on delete cascade`, `doc_type text`, `file_path text`, `original_name text`, `created_by`, `created_at`) mit `GRANT` für `authenticated` (SELECT/INSERT/DELETE) und `service_role` (ALL), RLS an, alle Policies über `public.has_role(auth.uid(),'admin')`, kein `anon`-Grant.

**Speicherpfad:** Upload in den bestehenden privaten Bucket `user-documents` unter `<admin-user-id>/manual/<reservation-id>/<datei>` – erfüllt die bestehende Upload-Policy (eigener Ordner) und die bestehende Admin-Lese-Policy, also keine Änderung an Storage-Policies. Anzeige über `createSignedUrl`.

**Server:** `src/lib/manual-reservations.functions.ts` – `upsertSchema` um die neuen Felder erweitert (Geburtsdatum via bestehendem `isValidIsoDate` aus `src/lib/age.ts`, kein Zukunftsdatum), `SELECT_COLUMNS` erweitert; neue Funktionen `listManualReservationDocuments`, `addManualReservationDocument`, `deleteManualReservationDocument` (jeweils `requireSupabaseAuth` + Admin-Prüfung, Zod-Validierung). Bestehende Reminder-/Verfügbarkeitslogik bleibt unangetastet.

**UI:** `src/components/admin/CalendarAdmin.tsx` – Formularstatus und Detailansicht um die neuen Felder und den Dokumentenbereich erweitert; Alter über `ageOnIsoDate` aus `src/lib/age.ts`. Design bleibt monochrom.

**Fix Dokumente:** `src/components/admin/DocumentBuilder.tsx` – gemeinsamer Zahlenparser (Komma → Punkt, ungültig → `null`/`0`), Fehlermeldungen als deutscher Klartext.

**Nicht berührt:** Preise, Buchungs-/Stripe-/Webhook-Logik, Rechnungslayout, E-Mails, Verfügbarkeitsprüfung, Registrierung/Login.

**Abschluss:** Typecheck, bestehende Tests und Produktionsbuild; Smoke-Test: Rechnung mit `0,90 €/km` erzeugen, Termin mit Geburtsdatum + zwei Dateien speichern, erneut öffnen, Datei löschen.
