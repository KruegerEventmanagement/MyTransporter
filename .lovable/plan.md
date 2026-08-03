## Ziel
Ein Rechnungs-/Angebots-Ersteller im Admin-Bereich: Formular ausfüllen, PDF im gewohnten Design erzeugen, herunterladen und direkt per E-Mail versenden.

## Neuer Admin-Tab „Dokumente"
Fünfter Tab in `src/routes/admin.tsx` (nur im Admin sichtbar, wie die bestehenden Tabs) mit einem Formular:

- Dokumenttyp: Rechnung oder Angebot (steuert Titel und Nummernkreis MT-… / AN-…)
- Empfänger: Firma, z.Hd./Ansprechpartner, Straße, PLZ/Ort, E-Mail, USt-IdNr. (optional)
- Nummer (automatisch vorgeschlagen, überschreibbar) und Datum
- Leistung: Fahrzeug, Fahrgestellnummer, Abholung (Datum/Uhrzeit), Rückgabe (Datum/Uhrzeit), Freikilometer, Preis pro Extra-km
- Positionen: beliebig viele Zeilen mit Bezeichnung + Betrag; jede Zeile netto oder brutto, plus Optionen „Kaution" und „Rabatt/Nachlass" (negativ)
- Freitext-Fußnote (optional)
- Live-Summenanzeige: Netto, 19 % USt., Brutto, Gesamtbetrag

Buttons: **PDF herunterladen** und **Per E-Mail senden** (an die Empfänger-E-Mail, Betreff/Text vorbelegt und editierbar).

## Technisch

**`src/lib/custom-document-pdf.server.ts`** (neu)
Generator nach dem Muster von `src/lib/invoice-pdf.server.ts` (pdf-lib, gleiches Layout: Logo-Header + „Transporter-Vermietung" + Adresse, Meta-Block rechts, Empfängerblock, Abschnitt „Leistung", Positionstabelle Netto/MwSt/Brutto, Summenblock, Fußzeile mit Kontakt, Unternehmen/USt-IdNr., Bankverbindung). Nimmt statt einer `booking_id` ein Eingabeobjekt aus dem Formular. Rabattzeilen und Kaution werden als eigene Positionen ausgewiesen; bei Angebot lautet die Überschrift „ANGEBOT" und die Nummer beginnt mit `AN-`.

**`src/lib/admin-documents.functions.ts`** (neu)
- `renderAdminDocument` — `createServerFn` mit `requireSupabaseAuth`, prüft `has_role(admin)`, validiert die Eingaben mit Zod, gibt `{ pdfBase64, filename }` zurück (Client löst daraus den Download aus).
- `sendAdminDocument` — gleiche Prüfung, erzeugt das PDF und versendet es via Resend (`RESEND_API_KEY`, Absender `info@mytransporter.org`) mit PDF-Anhang.

**`src/components/admin/DocumentBuilder.tsx`** (neu)
Formular-Komponente mit den bestehenden shadcn-Bausteinen, monochromes Design; wird im neuen Tab gerendert.

Keine Datenbank-Änderung nötig (Dokumente werden nicht gespeichert). Bestehende automatische Buchungsrechnung bleibt unverändert.
