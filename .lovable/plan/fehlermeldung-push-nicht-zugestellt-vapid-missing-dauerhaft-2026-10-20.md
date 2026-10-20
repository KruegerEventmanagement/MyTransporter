# Fehlermeldung „Push nicht zugestellt (vapid_missing)“ dauerhaft stoppen

## Ursache (geprüft)
Die Meldung erzeugt sich selbst immer wieder – seit 18:00 Uhr etwa einmal pro Sekunde (über 720 Einträge):

```text
Push klappt nicht -> Fehlereintrag "Push nicht zugestellt"
   -> jeder neue Eintrag löst automatisch einen Push an dich aus
   -> der Push klappt wieder nicht -> neuer Fehlereintrag -> ...
```

Dass der Push nicht klappt, liegt daran, dass die Live-Seite noch die alte Version mit dem kaputten Schlüssel nutzt. Der neue Schlüssel ist eingebaut, aber noch nicht veröffentlicht. Die Schleife selbst ist aber der eigentliche Fehler: Auch mit gültigem Schlüssel würde jeder andere Push-Fehler (z. B. kein Gerät angemeldet) wieder eine Endlosschleife auslösen.

## Was ich ändere
1. **Schleife sofort in der Datenbank kappen** (wirkt sofort, auch ohne Veröffentlichen): Fehlereinträge vom Typ „Push nicht zugestellt“ lösen keinen Push mehr aus.
2. **Doppelte Absicherung im Server:** Die Push-Weiterleitung ignoriert solche Fehlereinträge ebenfalls. Derselbe Push-Fehler wird höchstens einmal alle 6 Stunden notiert statt bei jedem Versuch.
3. **Kein Pop-up mehr im Admin-Bereich und kein Chrome-Fenster** für Push-Fehler. Sie stehen nur noch ruhig in der Benachrichtigungsliste.
4. **Die rund 720 Schleifen-Einträge als gelesen markieren**, damit deine Liste wieder aufgeräumt ist. Nichts wird gelöscht.
5. **Test**, der prüft, dass ein Push-Fehler keinen weiteren Push und keine zweite gleiche Meldung erzeugt. Danach alle Tests und Build.

## Danach
- Die Chrome-Meldungen hören sofort nach Schritt 1 auf.
- Damit Pushes wieder richtig auf dem Handy ankommen, musst du anschließend veröffentlichen (neuer Schlüssel). Ich sende keinen Test-Push und veröffentliche nicht selbst.

## Technische Details
- Ursache: Trigger `admin_notifications_push_trigger` (`private.trigger_admin_push`) ruft bei jedem INSERT `/api/public/hooks/notify-admin` → `pushToAdmins` → `logIssue` INSERT `push_failed` → Trigger erneut.
- Migration: `CREATE OR REPLACE private.trigger_admin_push` mit `IF NEW.type = 'push_failed' THEN RETURN NEW; END IF;` (übrige Logik unverändert).
- `notify-admin.ts`: `type === 'push_failed'` → 200 ohne Push.
- `push.functions.ts` `logIssue`: vor Insert prüfen, ob gleicher Titel in den letzten 6 h existiert; sonst nichts einfügen.
- `admin.tsx` Realtime-Handler: für `push_failed` weder `setAlertNotification` noch `new Notification`.
- Datenbereinigung: bestehende `push_failed`-Einträge auf gelesen setzen (kein DELETE).
