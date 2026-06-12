## Problem

Im Admin-Bereich gehen nach jedem Seiten-Aktualisieren zwei Schalter wieder auf "aus":

1. **Signalton** (`soundEnabled`) — wird nur im React-State gehalten, geht beim Reload verloren.
2. **Push aktivieren** — kann auf iPad/iOS verloren gehen, wenn der Service-Worker das Push-Abo zwischendurch wegwirft.

Du willst: einmal anschalten → bleibt für immer an, auf Handy und iPad, auch nach Reload.

## Was ich ändere

### 1. Signalton-Schalter merken

- Beim Klick auf "Signalton aktivieren" zusätzlich `localStorage.setItem("admin_sound_on", "1")` setzen.
- Beim Laden der Admin-Seite: wenn dieser Eintrag existiert, `AudioContext` automatisch wieder anlegen und `soundEnabled = true` setzen.
- Browser-Hinweis: iOS/Safari erlauben Audio nur nach einer Nutzer-Geste. Beim allerersten Reload nach dem Schließen des Browsers kann der Ton einen einzigen Tap brauchen, um die Audio-Engine wieder aufzuwecken — danach läuft er. Dafür zeige ich, wenn iOS den Auto-Start blockiert, einmalig einen kleinen Button "Ton entsperren". Der Schalter selbst bleibt aber „an".

### 2. Push dauerhaft halten + automatisch wiederherstellen

In `src/lib/push-client.ts` und `src/routes/admin.tsx`:

- Neue Funktion `ensurePushSubscribed()`:
  - Wenn `Notification.permission === "granted"` und in der Datenbank existiert für diesen User schon ein Push-Abo, **stilles** Re-Subscribe im Service-Worker (ohne erneuten Permission-Dialog) und Upsert in die Datenbank.
  - So bleibt „Push an", auch wenn iOS/Android das lokale Abo verworfen hat.
- Beim Laden der Admin-Seite wird `ensurePushSubscribed()` automatisch aufgerufen. Wenn es klappt → `pushState = "on"`.
- Der Toggle „Push aktivieren" bleibt für den ersten Klick (Permission-Dialog) zuständig. Danach übernimmt die Wiederherstellung das automatisch.
- Auf dem iPad zusätzlich: bei jedem Sichtbarwerden des Tabs (`visibilitychange → visible`) erneut `ensurePushSubscribed()` aufrufen, damit ein vom System weggeräumtes Abo sofort neu angemeldet wird.

### 3. iPad-spezifischer Hinweis

Auf iOS funktioniert Web-Push **nur**, wenn die Seite als PWA auf dem Home-Bildschirm installiert ist und aus dem App-Icon gestartet wurde. Das ist bei dir bereits eingerichtet. Wichtig fürs iPad: einmal über das App-Icon öffnen, einmal „Push aktivieren" tippen — danach erledigt die neue Auto-Wiederherstellung den Rest.

## Technische Details

- `src/routes/admin.tsx`: `useEffect` für Sound-Restore aus `localStorage`; `enableSound` schreibt in `localStorage`; neuer `useEffect` ruft `ensurePushSubscribed()` beim Mount + bei `visibilitychange`.
- `src/lib/push-client.ts`: neue Export-Funktion `ensurePushSubscribed()`, die `Notification.permission === "granted"` prüft, das vorhandene oder ein neues `pushManager.subscribe(...)` holt und in `push_subscriptions` upserted — ohne UI-Toast bei Fehlern.
- Keine Datenbank-Änderung nötig (`push_subscriptions` existiert bereits).
