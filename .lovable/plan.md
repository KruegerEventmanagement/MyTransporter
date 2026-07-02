## Fix: Countdown im Ausweis-Scanner bleibt bei "3" hängen

### Ursache
In `src/components/DocumentScanner.tsx` läuft der Countdown über einen `useEffect`, der `runCapture` in seinen Dependencies hat. `runCapture` wird bei jedem Render neu instanziert (via `useCallback` mit vielen Deps + `useServerFn`), und weil während der Countdown-Phase mehrere Re-Renders stattfinden, wird das `setTimeout` durch die Cleanup-Funktion jedes Mal sofort wieder abgebrochen, bevor die 1000 ms ablaufen. Ergebnis: "3" wird angezeigt, dekrementiert aber nie.

### Lösung
Countdown von der `runCapture`-Referenz entkoppeln, sodass der Timer stabil weiterläuft:

1. **`runCapture` in einem Ref spiegeln** (`runCaptureRef`), das per separatem Effekt aktuell gehalten wird.
2. **Countdown-Effekt entkoppeln**: Dependencies nur `phase`. Intern per `setInterval` von 3 → 0 herunterzählen und beim Erreichen von 0 `runCaptureRef.current?.()` aufrufen. Das Interval sauber cleanen, wenn Phase wechselt.
3. **State `countdown` bleibt** für die Anzeige, wird aber nur aus dem stabilen Interval-Effekt heraus gesetzt.
4. **`startCountdown`** setzt weiterhin `countdown = 3` und `phase = "countdown"`.

### Betroffene Datei
- `src/components/DocumentScanner.tsx` — Countdown-Effekt und ein neuer Ref-Sync-Effekt für `runCapture`.

Keine anderen Dateien, keine Server-/DB-Änderungen.
