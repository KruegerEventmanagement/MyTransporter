## Was geändert wird

### 1. Auto-Login nach E-Mail-Bestätigung

Aktuell wird man nach Klick auf den Bestätigungslink zur Startseite (`/?email_confirmed=1#booking`) zurückgeschickt und muss sich nochmal einloggen.

Änderung:
- Beide Registrierungs-Stellen (`Navbar.tsx` und `BookingSection.tsx`) setzen `emailRedirectTo` einheitlich auf `https://www.mytransporter.org/auth/confirm`.
- Auf `/auth/confirm` wird nach erfolgreichem `exchangeCodeForSession` / `verifyOtp` die Session geprüft. Wenn eine Session existiert (= eingeloggt), wird direkt auf `/profil` weitergeleitet. Nur als Fallback (keine Session zustande gekommen) wird wie bisher auf die Startseite mit Login-Hinweis geleitet.
- Kurze Erfolgsmeldung „E-Mail bestätigt – du bist eingeloggt" vor dem Redirect.

### 2. Ausweis- und Führerschein-Prozess sichtbar machen

Aktuell taucht der Scanner nur im Buchungs-Flow auf. Wer sich nur registriert, sieht ihn nie.

Änderung im Profil (`/profil`):
- Neuer Abschnitt „Verifizierung" oben auf der Profilseite mit zwei Karten:
  - Personalausweis (Vorder- + Rückseite)
  - Führerschein (Vorder- + Rückseite)
- Wenn in `user_documents` bereits Einträge für `id_front`, `id_back`, `license_front`, `license_back` existieren, wird die Karte als „✓ verifiziert" dargestellt; sonst startet der vorhandene `DocumentScanner`.
- Solange noch nicht beide Dokumente vollständig sind, erscheint oben auf der Profilseite ein kompakter Hinweis-Banner („Bitte Ausweis und Führerschein hochladen, um Buchungen abschließen zu können").

Im Buchungs-Flow (`BookingSection.tsx`) ändert sich nichts an der Logik – wer die Dokumente schon im Profil hochgeladen hat, sieht dort automatisch den „verifiziert"-Status und kann direkt weiter.

## Technische Details

- `src/components/Navbar.tsx`: `AUTH_CONFIRM_URL` zeigt auf `https://www.mytransporter.org/auth/confirm` (statt nur `origin + "/"`).
- `src/routes/auth.confirm.tsx`: Nach Bestätigung `supabase.auth.getUser()` prüfen; wenn User → `window.location.replace("/profil")`. Fallback bei fehlender Session → bisheriger Redirect.
- `src/routes/profil.tsx`:
  - Neuer State für vorhandene Dokumente: `select` auf `user_documents` (Spalte `doc_type` für den eingeloggten User).
  - Neue Section „Verifizierung" mit zwei `<DocumentScanner documentType="id" />` und `<DocumentScanner documentType="license" />`.
  - Banner oben einblenden, solange nicht alle vier `doc_type`-Werte vorhanden sind.
- Keine Datenbankänderungen nötig – Tabelle `user_documents` und Bucket `user-documents` existieren bereits.

## Was NICHT geändert wird

- Keine Pflicht-Sperre an anderen Stellen (Buchung bleibt wie sie ist).
- Keine Änderung am bestehenden Scanner-UI/Upload-Verhalten.
- Keine neuen Mails oder Templates.
