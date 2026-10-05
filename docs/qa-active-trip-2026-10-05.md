# QA – Aktive Fahrtansicht, Rückgabe, Erinnerung (05.10.2026)

Basis-Commit vor Änderung: e1841ee1274fa5843c131608549fb7994d9347cc
Geprüfter Stand: 723bf356f70d2d4a0ff51db7af06dd8765bd1aee (Stand vor Commit dieses Auftrags; Deployment NICHT ausgeführt)

## Befehle und Exitcodes (einzeln ausgeführt, keine Pipeline, die Fehler verdeckt)

| Befehl | Exitcode | Ergebnis |
|---|---|---|
| `bunx vitest run src/lib/active-trip.test.ts src/lib/trip-return.test.ts src/lib/photo-queue.test.ts src/lib/return-draft.test.ts src/components/ActiveTrip.test.tsx src/components/TripFlows.test.tsx` | 0 | 52 Tests (nach Fix des SW-Helper-Imports) |
| `bunx tsgo --noEmit` | 0 | keine Typfehler |
| `bunx vitest run` (gesamt) | 0 | 37 Dateien, 407 Tests grün |
| `bun run build` | 0 | Produktionsbuild erfolgreich |
| Playwright 390 px / 1280 px | 0 | kein horizontaler Overflow, keine Page-Errors, Leiste für nicht angemeldete Besucher korrekt unsichtbar |

## Testumfang (echte Helfer-, Komponenten- und Serverlogik-Tests, keine Textsuche)

- Zeitauflösung: Spiegel von `plan_end_at`/`local_start_at` (3h/6h/24h-Varianten, multi_2d–7d, week_xN, `km` = 22:00 Berlin, unbekannt = 24h), Sommer-/Winterzeitwechsel 25.10., 10-Minuten-Erinnerung früh/fällig/verspätet.
- Aktive Miete: nur eigene Buchung (`user_id`-Filter), Fremdkonto/cancelled/completed/paid ausgeschlossen, Mehrfachauswahl deterministisch mit Vorrang der geöffneten ID, Phase aus Serverstatus, `returning` bleibt Rückgabe.
- Leiste: Sichtbarkeit außerhalb `/trip/...`, Ziel exakt `/trip/<id>`, Entfernen bei Abmeldung und bei beendeter Miete, Beibehaltung des Snapshots bei Netzfehler beim Revalidieren.
- Fahrtansicht: „Nicht jetzt“ löst keine Standortabfrage aus und fragt nach Reload nicht erneut; verzögerte Karteninitialisierung nach Unmount erzeugt keine Karte; Routen werden nach Dauer sortiert, behalten aber den Originalindex; veraltete Directions-Antworten werden verworfen; Logo verlinkt die Startseite; Rückgabe-Checkliste inkl. gebuchtem Zubehör; verspätete Rückgabe weiter möglich; Push nur nach Klick.
- Rückgabe-Server: Eigentums-/Statusprüfung, fehlende Fotokategorien blockieren, begründete Ausnahmen erlauben Meldung mit Prüfvermerk, Endstand 0 zulässig, unplausibler kleinerer Endstand (399999-Fall) erzeugt manuelle Prüfung statt Berechnung, Idempotenz bei verlorener Antwort/Reload und bei parallelem Doppelklick ohne zweite Admin-Benachrichtigung.
- Fotoqueue: Offline-Speicherung, identischer stabiler Pfad beim Retry, DB-Fehler nach Upload lädt nicht erneut hoch, „existiert bereits“ gilt als hochgeladen, Mehrfachaufruf überträgt genau einmal, Trennung nach Nutzer und Buchung.
- Entwurf: Schritt/Kilometer/Tank/Ausnahme/Code je Nutzer und Buchung, älterer Stand überschreibt keinen neueren, keine Bilddaten in localStorage, Navigationszustand validiert.
- Service Worker: `notificationclick` öffnet ausschließlich same-origin, nur exakte `/trip/<uuid>`-Pfade oder `/admin`, fremde Hosts und Traversal werden abgewiesen.
- Bestehende Kamera-/Fototests in `TripFlows.test.tsx` blieben erhalten und laufen weiter.

## Datenbank

Migration `supabase/migrations/20261005180935_31a66dbd-ce17-4149-92b0-5c7ce5b82f9e.sql`: ausschließlich additive, nullable Felder in `bookings` (`return_reported_at`, `return_review_reason`, `return_exceptions`, `end_km_manual`, `return_reminder_10min_for`). Keine Daten gelöscht oder geändert, keine Preis-, Stripe-, Kalender- oder Awin-Logik berührt. Linter meldete drei bereits zuvor bestehende Hinweise (Extension im public-Schema, SECURITY-DEFINER-Ausführung, Leaked-Password-Schutz aus) – unverändert aus dem Bestand.

## Grenzen / offen

- Keine echte Buchung, Zahlung, Kundenmail oder Push-Zustellung ausgelöst; die 18 Bestandsbuchungen wurden nicht verändert oder benutzt.
- Kein physischer iPhone-/Android-Test. Aussagen zu iOS beruhen nur auf Code und Desktop-Browserprüfung.
- `public/sw.js` liefert nur eine Offline-Hinweisseite und die Push-/Klicklogik. Das ist bewusst **keine** vollwertige Offline-App: es werden keine kontobezogenen Seiten, API-Antworten oder Kartendaten gecacht.
- Hintergrund-Push erreicht nur Geräte mit eigener Opt-in-Subscription; ohne Subscription bleibt die Erinnerung on-screen beim Öffnen/Fokus.
- Google-Maps-Nutzung bleibt online; kein Offline-Kartenversprechen, kein Hintergrund-GPS.
- Deployment bewusst nicht ausgeführt.
