# Fehler bei „Sicher bezahlen" direkt nach der Registrierung

## Was ich geprüft habe

- Der Bezahl-Button ruft die Server-Funktion `createBookingCheckout` auf. Diese verlangt zwingend eine gültige Anmeldung (`requireSupabaseAuth`): ohne mitgesendeten Anmelde-Token antwortet sie mit „Unauthorized" (401).
- Der Anmelde-Token wird clientseitig von `src/lib/safe-auth-attacher.ts` angehängt – aber nur, wenn das Lesen der Sitzung **innerhalb von 1,5 Sekunden** klappt. Danach wird der Token stillschweigend weggelassen und die Anfrage geht **ohne Anmeldung** raus.
- Genau in der Sekunde nach der Registrierung ist das Lesen der Sitzung am langsamsten (frisch geschriebene Sitzung, im Vorschau-Modus über einen zwischengeschalteten Speicher). Das passt exakt zum Muster „nur bei der Registrierung tritt der Fehler auf".
- Zusätzlich verschluckt die allgemeine Fehlerbehandlung (`src/start.ts`) den echten Grund und liefert eine generische Fehlerseite, weshalb im Buchungsablauf nur „Zahlung konnte nicht geladen werden" ohne brauchbare Ursache erscheint.

Der Auslöser ist also mit hoher Wahrscheinlichkeit der 1,5-Sekunden-Abbruch beim Token. Da die genaue Fehlermeldung aus dem Screenshot fehlt, prüfe ich das im ersten Schritt am laufenden Ablauf nach und passe die Behebung an, falls sich ein anderer Grund zeigt.

## Vorgehen

1. Ablauf im Browser nachstellen (frisches Test-Konto anlegen, bis zum Bezahlen gehen) und die echte Fehlerantwort mitlesen.
2. Token-Anhängen robust machen: auf die Sitzung warten statt nach 1,5 Sekunden aufzugeben – mit großzügigem Sicherheitslimit, kurzem Neuversuch und Nutzung des bereits im Speicher vorhandenen Tokens. Ohne Token wird die Zahlung gar nicht erst gestartet, sondern eine verständliche Meldung gezeigt („Anmeldung wird noch abgeschlossen, bitte erneut auf Sicher bezahlen tippen").
3. Vor dem Start der Zahlung im Buchungsablauf sicherstellen, dass die Anmeldung tatsächlich aktiv ist; andernfalls kurz warten und automatisch erneut versuchen.
4. Fehlermeldungen sprechend machen: Anmeldeproblem, abgelaufene Reservierung und fehlende Dokumente werden unterschiedlich und auf Deutsch angezeigt, damit Kunden wissen, was zu tun ist.
5. Erneut testen (Registrierung → Dokumente → Bezahlen), Typprüfung und Produktions-Build ausführen. Kein Veröffentlichen.

## Technische Details

- `src/lib/safe-auth-attacher.ts`: Timeout deutlich erhöhen (z. B. 8 s) plus einmaliger Retry; zuerst `getSession()` aus dem Cache, danach ggf. `onAuthStateChange`-Warteschleife. Kein stilles Weglassen des Headers mehr bei erkennbar angemeldetem Nutzer.
- `src/components/BookingSection.tsx`: Im Klick-Handler von „Sicher bezahlen" vor dem Aufruf `supabase.auth.getSession()` absichern, bei fehlendem Token einmal warten/erneut versuchen; 401-Antworten in eine verständliche Meldung übersetzen.
- `src/lib/payments.functions.ts` bleibt inhaltlich unverändert (Preise, Kaution, Hold-Prüfung); nur Rückgabetexte werden nicht angetastet.
- Kein Eingriff in generierte Dateien (`auth-middleware.ts`, `client.ts`).
