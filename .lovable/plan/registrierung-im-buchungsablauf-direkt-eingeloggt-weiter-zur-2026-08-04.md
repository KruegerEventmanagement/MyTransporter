# Registrierung im Buchungsablauf: direkt eingeloggt weiter zur Zahlung

## Problem
Nach "Registrieren & weiter zur Zahlung" bleibt der Ablauf stehen. Das Konto wird angelegt (E-Mail kommt an), aber die anschließende automatische Anmeldung schlägt still fehl bzw. wird nur intern abgefangen – der Nutzer landet nicht im Zahlungsschritt und sieht keinen Hinweis, was los ist.

Wahrscheinliche Ursache: die Registrierung liefert keine Session, weil die E-Mail-Bestätigung noch verlangt wird; die direkt danach versuchte Anmeldung wird deshalb abgewiesen ("Email not confirmed"). Der Fehler wird abgefangen, ohne dass der Ablauf weiterläuft oder eine Meldung erscheint. Das ist vor der Umsetzung mit einem echten Testdurchlauf zu bestätigen.

## Was geändert wird
1. **Automatische Konto-Bestätigung aktivieren**, damit nach dem Registrieren sofort eine Session besteht (kein Klick im Postfach nötig). Zusätzlich wird geprüft, ob dies bereits aktiv ist – falls ja, wird die tatsächliche Fehlermeldung aus dem Testdurchlauf behoben.
2. **Registrierung läuft garantiert weiter**: nach erfolgreichem Anmelden wird direkt der Zahlungsschritt gesetzt, unabhängig davon, ob die Session aus der Registrierung oder aus dem nachträglichen Login kommt. Kurzer Wiederholungsversuch (1–2 Sekunden), falls das Konto serverseitig noch nicht bereit ist.
3. **Kein stiller Stillstand mehr**: schlägt der Login trotzdem fehl, erscheint eine klare, deutsche Fehlermeldung mit Button "Erneut versuchen" bzw. "Jetzt einloggen" – der Nutzer bleibt nie ohne Rückmeldung.
4. **Gescannte Dokumente**: der Upload der zwischengespeicherten Ausweis-/Führerschein-Fotos läuft wie bisher automatisch nach dem Login; der Sprung zur Zahlung erfolgt erst, wenn der Upload durch ist (mit sichtbarem Ladehinweis), und bei Upload-Fehler mit Wiederholen-Option.
5. **Zahlungsschritt mit Übersicht**: nach dem Weiterleiten sieht der Nutzer die vollständige Zusammenfassung (Datum, Uhrzeit, Tarif, Zubehör, Kaution, Gesamtpreis), die Haftungs-Checkbox und die 15-Minuten-Reservierung, die erst hier startet.

## Technische Umsetzung
- `supabase--configure_auth` mit `auto_confirm_email` aktivieren (Zustand vorher per Testdurchlauf/Logs verifizieren).
- `src/components/BookingSection.tsx`, `handleSignUp`: Ergebnis-Handling vereinheitlichen (Session aus `signUp` ODER `signInWithPassword`), `authUser` sofort setzen, Retry für den Login, Fehlerpfad mit sichtbarer Meldung statt stillem `return`; `signupEmailSent`-Zwischenzustand nur noch als echter Fallback.
- Sprung zum Zahlungsschritt zentral über den bestehenden Effekt (`registrationComplete && step === 4 && !pendingUploading`) beibehalten und sicherstellen, dass `authUser` gesetzt ist, damit `docsReady`/Upload-Effekt greifen.
- Verifizierung des Ablaufs per Browser-Durchlauf (Test-Konto): Scannen → Registrieren → Zahlungsschritt sichtbar.
