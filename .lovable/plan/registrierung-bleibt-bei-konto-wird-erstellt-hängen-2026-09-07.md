# Registrierung bleibt bei „Konto wird erstellt…" hängen

## Was passiert

Im Buchungsablauf (iPhone/Safari) bleibt der Knopf nach dem Absenden dauerhaft auf „Konto wird erstellt…". Es gibt keinen Fehler und keinen nächsten Schritt – der Vorgang wartet endlos.

## Ursache

Sobald ein Konto angelegt wird, meldet das Anmeldesystem den neuen Zustand an alle Zuhörer in der Seite. Einer dieser Zuhörer (in der oberen Leiste) fragt dabei sofort die Datenbank nach der Admin-Berechtigung ab und lässt das Anmeldesystem darauf warten. Dadurch blockieren sich beide gegenseitig: die Registrierung wartet auf den Zuhörer, der Zuhörer wartet auf das Anmeldesystem. Auf iPhone/Safari tritt diese Blockade besonders zuverlässig auf, weil Safari die interne Sperre strenger handhabt.

Dass die Konten selbst korrekt angelegt und automatisch bestätigt werden, ist geprüft – der Fehler liegt allein in diesem Blockade-Effekt in der Seite.

## Was geändert wird

1. **Blockade auflösen:** Der Zuhörer in der oberen Leiste merkt sich nur noch den neuen Anmeldezustand und lädt Name/Admin-Berechtigung erst unmittelbar danach nachgelagert – also ohne das Anmeldesystem aufzuhalten. Sichtbar ändert sich dadurch nichts.
2. **Nie wieder endloses Warten:** Registrierung und Anmeldung erhalten eine Zeitgrenze. Dauert es zu lange, erscheint eine klare deutsche Meldung mit „Erneut versuchen" bzw. „Jetzt einloggen", statt dass der Knopf stehen bleibt.
3. **Automatischer Weiterlauf absichern:** Ist das Konto trotz Zeitgrenze angelegt, wird der Anmeldezustand kurz nachgeprüft und der Ablauf geht direkt zur Zahlung weiter – inklusive Übertragung der zuvor fotografierten Dokumente.
4. **Gleiche Blockade an anderen Stellen ausschließen:** Alle weiteren Zuhörer auf Anmeldeänderungen werden auf denselben Punkt geprüft, damit dort nichts mehr wartend die Anmeldung aufhält.

## Technische Details

- `src/components/Navbar.tsx`: Im `onAuthStateChange`-Callback keine `await`-Aufrufe gegen Supabase mehr. Zustand synchron setzen, Rollen-/Profilabfrage über `setTimeout(..., 0)` bzw. einen Effekt auf die User-ID auslagern (bekannter Supabase-Auth-Deadlock: Callbacks laufen innerhalb der Auth-Sperre).
- `src/components/BookingSection.tsx`: `handleSignUp`/`handleLogin` mit `withTimeout`-Wrapper (z. B. 20 s), Fehlerpfad setzt `authLoading` zurück und zeigt `authError` plus Login-Fallback. Nach Timeout `supabase.auth.getSession()` prüfen und bei vorhandener Session normal weiterlaufen (`setStep(5)`).
- Restliche `onAuthStateChange`-Nutzung (BookingSection ist bereits synchron) prüfen; keine Änderung an Preisen, Verfügbarkeit oder Zahlungslogik.
- Verifizierung: Typecheck, Produktionsbuild und ein Browser-Durchlauf der Registrierung mit Testkonto (mobile Viewport) bis zum sichtbaren Zahlungsschritt.
