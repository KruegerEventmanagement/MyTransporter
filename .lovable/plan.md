Ich behebe die Push-Benachrichtigungen so, dass du als eingeloggter Admin bei jeder neuen Buchung und jeder neuen Registrierung zuverlässig benachrichtigt wirst.

Umsetzung:
1. Einen zentralen Server-Trigger bauen: `sendAdminPush` wird nicht mehr nur aus dem Browser-Buchungsabschluss aufgerufen, sondern auch immer dann, wenn eine Admin-Benachrichtigung erstellt wird.
2. Registrierung abdecken: Die bestehende Registrierungs-Benachrichtigung wird zusätzlich per Push an alle gespeicherten Admin-Geräte gesendet.
3. Buchung abdecken: Jede erfolgreiche Buchung erzeugt weiterhin eine Admin-Benachrichtigung und löst darüber sicher eine Push-Nachricht aus; doppelte Pushs für dieselbe Buchung werden vermieden.
4. Fehler sichtbar machen: Wenn kein Admin-Gerät abonniert ist, VAPID fehlt, oder ein Push-Versand fehlschlägt, wird das sauber geloggt und als Admin-Hinweis gespeichert, damit man den Grund sieht statt still nichts zu bekommen.
5. Admin-Geräte stabil registrieren: Das Push-Abo auf jedem Admin-Gerät wird beim Öffnen des Admin-Bereichs automatisch erneuert/gespeichert, wenn die Berechtigung bereits erteilt ist.
6. Service Worker aktualisieren: Push-Benachrichtigungen bleiben sichtbar, vibrieren wo unterstützt und werden beim Anklicken direkt zum Admin-Bereich führen.

Wichtige Einschränkung: Auf iPhone/iPad funktionieren echte Web-Push-Benachrichtigungen nur, wenn die Website zum Home-Bildschirm hinzugefügt wurde; eigene Benachrichtigungstöne kann iOS für Web-Push nicht erzwingen. Auf Laptop/Android/unterstützten Browsern wird der normale Systemton verwendet.