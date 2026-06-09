Der Upload scheitert weiterhin an der Speicher-Berechtigung, nicht am Formular. Die aktuelle Policy ruft `has_role(...)` beim Hochladen auf. Diese Funktion ist zwar für normale angemeldete Nutzer freigegeben, aber nicht für die interne Storage-Rolle, die den Datei-Upload tatsächlich ausführt. Dadurch wird der Upload von Fahrzeugfotos weiterhin als nicht erlaubt abgelehnt.

Plan:

1. **Storage-Berechtigung korrigieren**
   - `public.has_role(uuid, app_role)` zusätzlich für die interne Storage-Rolle ausführbar machen.
   - Die Funktion bleibt weiterhin `SECURITY DEFINER`, damit die Admin-Rolle zuverlässig geprüft wird.

2. **Fahrzeugfoto-Policy robust neu setzen**
   - Die Upload-, Update- und Löschregeln für den Bucket `vehicles` sauber neu anlegen.
   - Erlaubt bleibt nur: angemeldete Admins dürfen Fahrzeugbilder hochladen, ersetzen und löschen.
   - Öffentliche Fahrzeugbilder bleiben weiter per öffentlicher URL sichtbar, wie bisher.

3. **Optional kleine UI-Absicherung im Admin-Formular**
   - Falls nötig, im Fahrzeug-Editor die Upload-Fehlermeldung klarer anzeigen, damit man sofort sieht, ob der Datei-Upload oder das Speichern der Fahrzeugdaten scheitert.

4. **Prüfung danach**
   - Nochmals prüfen, ob die neue Berechtigung in der Datenbank aktiv ist.
   - Danach sollte „Fahrzeuge → Bearbeiten → Foto hochladen“ ohne 403/RLS-Fehler funktionieren.