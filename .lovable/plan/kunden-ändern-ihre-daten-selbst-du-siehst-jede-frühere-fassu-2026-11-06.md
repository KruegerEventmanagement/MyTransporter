# Kunden ändern ihre Daten selbst, du siehst jede frühere Fassung

## Was Kunden im Profil neu bekommen
- **E-Mail ändern:** neue Adresse eingeben, Bestätigungslink geht an die neue Adresse. Erst nach Klick gilt sie. Bis dahin bleibt die alte aktiv.
- **Passwort ändern:** aktuelles Passwort + neues Passwort (zweimal).
- **Persönliche Daten ändern:** Name, Telefon, Geburtsdatum, Adresse, Firma (gibt es teils schon, wird in einem Bereich "Meine Daten" gebündelt).
- **Konto löschen:** bleibt wie bisher.
- Texte in allen sieben Sprachen.

## Was du im Adminbereich siehst
- Beim Kunden neuer Bereich **"Änderungsverlauf"**: jede Änderung mit Datum/Uhrzeit, Feld, alter Wert, neuer Wert. Die allererste Eingabe bei der Registrierung steht ganz oben.
- E-Mail-Wechsel werden mit alter und neuer Adresse protokolliert, sobald bestätigt.
- Der Verlauf kann vom Kunden weder eingesehen noch gelöscht werden, auch nicht beim Löschen des Kontos.

## Fotos (Ausweis, Führerschein, Fahrtfotos)
- Schon heute so: wenn der Kunde ein Dokument entfernt, verschwindet es nur bei ihm; du siehst es weiter mit Vermerk "vom Kunden entfernt". Das bleibt so und wird mit einem Test abgesichert.

## Birgit Linz sofort
- Ich trage ihr nach Freigabe die neue Adresse Birgitlinz73@gmail.com ein (die alte bleibt im Verlauf), oder sie nutzt danach selbst die neue Funktion. Du entscheidest beim Freigeben; Standard: ich ändere es direkt.

## Technische Details
- Neue Tabelle `customer_change_log` (user_id ohne FK, field, old_value, new_value, source, changed_at); nur Admin darf lesen, niemand ändern/löschen (Trigger sperrt Update/Delete).
- Trigger auf `profiles` (AFTER INSERT/UPDATE) schreibt je geändertes Feld eine Zeile; Trigger auf `auth.users` email-Änderung schreibt Mailwechsel (alte/neue).
- Kontolöschung (privacy-store) lässt den Verlauf unberührt.
- E-Mail: `supabase.auth.updateUser({ email }, { emailRedirectTo: https://mytransporter.org/profil })`; Profil-E-Mail per Trigger nach Bestätigung nachziehen.
- Passwort: `updateUser({ password, current_password })`; "aktuelles Passwort verlangen" wird aktiviert.
- Tests: Verlauf entsteht bei Änderung, Kunde kann Verlauf nicht lesen/löschen, Dokument-Entfernen bleibt für Admin sichtbar.
