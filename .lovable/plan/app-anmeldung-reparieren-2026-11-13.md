# App-Anmeldung reparieren

## Was schon feststeht
- **Die E-Mail war kein Fehler.** Die Kundin hat die Rückgabe in der App erst um 14:01 Uhr gemeldet. Deshalb ging um 13:30 Uhr automatisch die Erinnerung "Mietende bald" raus. Das bleibt so, wie du es entschieden hast.
- **Niemand hat an der Anmeldung etwas verändert.** Bei uns ist heute kein gescheiterter Anmeldeversuch angekommen. Der Fehler passiert also schon in der App auf dem Handy, bevor die Anmeldung bei uns ankommt. Um 20:41 Uhr gab es außerdem einen Absturz in der Android-App.

## Was ich mache
1. **Ursache finden:** Die App, wie sie im Store liegt, auf dem Rechner nachbauen und die Anmeldung mit einem Testkonto durchspielen: mit E-Mail und Passwort, beim Registrieren und beim Zurücksetzen des Passworts. Dabei prüfe ich, ob die Store-Version noch die alte App-Kopie ist oder schon die Live-Website lädt.
2. **Nur den gefundenen Fehler beheben:** Zum Beispiel blockierte Anfragen zwischen App und Server, eine Weiterleitung aus der App heraus oder einen Absturz, wenn man die App wechselt und zurückkommt.
3. **Klare Meldungen:** Statt eines allgemeinen Fehlers sieht die Kundin, was los ist, zum Beispiel "keine Verbindung" oder "falsches Passwort", und bekommt einen Knopf zum erneuten Versuchen. Kein endloses Laden.
4. **Fehlerprotokoll:** Fehler bei der Anmeldung in der App werden künftig ohne Passwörter oder Kundendaten mitgeschrieben, damit wir sie sehen.
5. **Tests** für die Anmeldung in der App ergänzen. Buchungen, Preise, Fotos und Zahlungen fasse ich nicht an.

## Was offen bleibt
- Wenn die Ursache in der alten App-Version im Store liegt, musst du eine neue App-Version hochladen. Das kann ich nicht selbst machen.
- Auf einem echten Handy kann ich nicht testen.

## Technische Details
- Prüfen: Version in capacitor.config.ts/android, server.url, CORS in src/lib/native/cors.ts für Auth-relevante Server-Funktionen, Supabase-Auth-Aufrufe im WebView (Storage, Redirect-URLs), Fehler "Java object is gone" (Bridge nach Activity-Neustart).
- Bei Bedarf Playwright mit Android-WebView-User-Agent und Capacitor-Origin.
