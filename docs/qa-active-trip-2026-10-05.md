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

## Nachtrag: Root-Befunde (1)–(6), 05.10.2026 ~18:50 UTC

| Befehl | Exitcode | Ergebnis |
|---|---|---|
| `bunx vitest run src/lib/trip-return-sql.test.ts` | 0 | 10 Tests, echtes SQL in PGlite (In-Memory-Postgres) |
| `bunx tsgo --noEmit` | 0 | keine Typfehler |
| `bunx vitest run` (gesamt) | 0 | 39 Dateien, 420 Tests |
| `bun run build` | 0 | Produktionsbuild erfolgreich |

1. **Endzeit:** Keine Endzeit-Spalte vorhanden. `src/lib/trip-time.ts` spiegelt `plan_end_at(local_start_at(start_date,start_hour),plan_id)` inkl. `week_xN` (= N·168 h wie SQL). Hinweis: `bookingWindowMs` in `booking-window.ts` kennt `week_xN` nicht über `getPlanById` und fiele dort auf 24 h; unverändert gelassen (Verfügbarkeit nicht Teil dieses Auftrags), bitte separat prüfen. Keine Verlängerungen versprochen.
2. **Feldschutz:** Migration `20261005184717_…sql`: Trigger `bookings_guard_customer_update`. Kunden können Status (außer paid/confirmed→active), Zeitraum, Tarif, Fahrzeug, Codes, Mehrkilometer/Preis, Rabatt, Erinnerungs- und Rückgabeprüffelder nicht mehr direkt ändern; `start_km` nur bei Abholung; Rückgabe-Entwurf (end_km, Tank) nur während aktiver Miete. Service-Rolle (Webhook/Cron), Admins und `report_trip_return` bleiben frei. Getestet: Manipulationen abgewiesen, PreDrive-Abholung, Entwurf, Admin, Service-Rolle.
3. **Fotonachweis:** `trip_confirmed_photo_types` zählt nur Zeilen im eigenen Buchungsordner mit echtem, nicht leerem `image/*`-Objekt in `trip-photos`; fremde Ordner, URLs, Traversal, leere/Nicht-Bild-Objekte zählen nicht (getestet). Queue: Kandidatenpfad vs. bestätigter Upload-Pfad getrennt; „existiert bereits“ zählt nur, wenn das Objekt unter genau diesem Pfad lesbar ist (kein Upsert).
4. **Status-Aliase:** started/running/in_progress/picked_up aktiv, returning/return_pending Rückgabe – in TS und SQL; kein Rücksprung zur Abholung.
5. **Erinnerung:** Rückgabe-Push aus `send-reminders` entfernt (Datei wieder identisch mit e1841ee). Neuer token-geschützter Hook `/api/public/hooks/return-reminders`, Job `mt-return-reminders` jede Minute (1.440 Läufe/Tag; DB läuft durch den bestehenden Minuten-Kalenderjob ohnehin). Claim prüft Status, Tarif, Startdatum/-stunde und vorheriges Ende erneut; Versand nur nach gewonnenem Claim. Migration `20261005184838_…sql`. Keine Testsendung ausgelöst.
6. **Preis:** Mehrkilometer/Preis werden nur noch in `report_trip_return` aus `start_km`, `free_km`, `km_price_cents`, `plan_id` der Buchung berechnet; der Browser schreibt keine `extra_km`/`extra_km_charge_cents` mehr. Endstand < Start → Prüfungsfall ohne Berechnung.

Linter: neuer Hinweis „SECURITY DEFINER durch angemeldete Nutzer ausführbar“ für `report_trip_return` ist beabsichtigt (Funktion prüft `auth.uid()` + Eigentum + Status). Vorbestehend: Extension im public-Schema, Leaked-Password-Schutz aus. Vorbestehend und nicht geändert: Hook `send-reminders` prüft kein Token.

## Abschlussprüfung 05.10.2026 ~19:15 UTC (ab Commit 8afd1db3739bb7856571b0eac8f1429568de4d53, HEAD 9f028f2)

Seit 8afd1db nur `src/routeTree.gen.ts` (automatisch generiert) geändert; keine offene Implementierung gefunden.

| Befehl | Exitcode | Ergebnis |
|---|---|---|
| `bunx vitest run` gezielt: active-trip, trip-return, trip-return-sql (PGlite), photo-queue, return-draft, return-reminder, ActiveTrip.test.tsx (inkl. Service-Worker notificationclick), TripFlows.test.tsx | 0 | 8 Dateien, 65 Tests |
| `bunx vitest run` (gesamt) | 0 | 39 Dateien, 420 Tests |
| `bunx tsgo --noEmit` | 0 | keine Typfehler |
| `bun run build` | 0 | Produktionsbuild erfolgreich |
| Playwright 390 px / 1280 px (`/`, `/trip/<fremde-UUID>` nicht angemeldet) | 0 | kein horizontaler Overflow, keine Page-Errors, Leiste unsichtbar, Fahrt leitet ohne Login um |

Live-DB (nur lesend geprüft): Trigger `bookings_guard_customer_update_trigger` aktiv; `report_trip_return` für `anon` nicht ausführbar; Cron-Jobs: `mt-return-reminders` minütlich (neu), `mt-send-booking-reminders` */15 und `mt-process-manual-notifications` */15 unverändert. Migrationen nur additiv (Spalten nullable, Funktionen, Trigger, ein Cron-Job); keine Bestandsbuchung verändert.

Weiterhin offen: kein physischer iPhone/Android-Test, kein Push-Empfangstest, kein echter Rückgabe-Durchlauf mit Live-Buchung, kein Deploy; `bookingWindowMs` kennt `week_xN` nicht (separat prüfen); Hook `send-reminders` ohne Token (vorbestehend, unverändert).

## Nachtrag 05.10.2026 ~19:25 UTC: offene Punkte geschlossen

1. **week_xN:** `bookingWindowMs` nutzte bereits `getPlanById`, das `week_xN` als N·7 Tage auflöst (= N·168 h wie `plan_end_at`); kein Code-Fehler. Neue Regressionstests `src/lib/booking-window-plans.test.ts` gleichen `bookingWindowMs` für alle Plan-IDs (3h…24h-Varianten, multi_2d–7d, week_x1/2/4/12, km, unbekannt = 24 h) an drei Startzeiten inkl. Zeitumstellung gegen `resolveTripWindow` ab.
2. **send-reminders:** Hook verlangt jetzt `NOTIFY_HOOK_TOKEN` (Query `token` oder `x-hook-token`), gleiches Muster wie return-reminders. Migration: neue Funktion `private.run_send_reminders_hook()` (Kopie der bestehenden Vorlage, Token/URL aus `private.app_config`, für PUBLIC/anon/authenticated entzogen); Job `mt-send-booking-reminders` bleibt `*/15 * * * *`, ruft nur noch diese Funktion. Mail-Logik unverändert. Reihenfolge sicher: Der aktuell veröffentlichte alte Code ignoriert den Token, der neue verlangt ihn – Cron funktioniert vor und nach Veröffentlichung.

| Befehl | Exitcode | Ergebnis |
|---|---|---|
| `bunx vitest run` booking-window-plans, booking-window, return-reminder, trip-return-sql | 0 | 87 Tests |
| `bunx vitest run` (gesamt) | 0 | 40 Dateien, 482 Tests |
| `bunx tsgo --noEmit` | 0 | – |
| `bun run build` | 0 | – |
| `POST /api/public/hooks/send-reminders` ohne bzw. mit falschem Token (lokal) | – | 401, 401 (keine Verarbeitung, keine Mail) |

Kein Aufruf mit gültigem Token, keine Mail, kein Push, kein Deploy. Offen: physische Gerätetests, Push-Empfangstest.

## Nachtrag 06.10.2026 (Basis fedc221): Restfehler Fahrt-Stabilisierung

1. **Leiste oben:** `ActiveTripBanner` jetzt `fixed top-0`, 44 px + `env(safe-area-inset-top)`, schwarz, weißer Text exakt „Sofort zurückkehren“. Versatz über `--mt-trip-bar` (body-padding-top, Navbar `top`, InstallBanner, Toaster-Offset, sticky Header via `top-trip-bar`). CookieConsent/HelpBubble: alte Bottom-Abstände entfernt. Leiste ist Geschwister von `<Outlet />` → kein Remount der Buchung. Auf `/trip/...` keine Leiste.
2. **TripPage:** `key={bookingId}`; Request-Generation + Unmount-Flag + Nutzer-Ref; Auth-Callback setzt nur synchronen State; Konto-/Buchungswechsel leert sofort; Kinder mit Key `userId:bookingId`; beschädigte Demo-Daten → Fehlermeldung statt Endlos-Laden; Fehlertext ohne „läuft unverändert weiter“.
3. **useActiveTrip:** späteres Auth-Ereignis gewinnt gegen initiales `getSession`; Identität und Generation werden synchron beim Authwechsel invalidiert; Ausgabe nur bei passender Identität; kein setState nach Unmount; Refresh bei Wechsel der geöffneten Fahrt.
4. **Abholort:** `DEFAULT_PICKUP_ADDRESS` entfernt. Nur bestätigte `vehicles.pickup_address` (Status loading/ok/missing/error); Lookup-/Geocodefehler ehrlich angezeigt, Rückgabe bleibt bedienbar; ohne GPS und ohne bestätigten Abholort keine Route, Hinweis „Noch kein Startpunkt“. Späte GPS-/Geocoder-Callbacks nach neuer Suche/Entfernen/Unmount verworfen. Berechtigung `vehicles` unverändert.
5. **Rückgabe-Erinnerung:** Bei Push-Fehler oder `sent: 0` wird nur der eigene, noch unveränderte Claim (`= endIso` + id/status/plan/start) auf den Vorwert zurückgesetzt → nächster Minutenlauf im Zeitfenster versucht erneut; neuere/parallele Claims bleiben. Tag `mt-return-<id>` dedupliziert. Keine neue Joboberfläche. Native App zeigt weiterhin keine Push-Erfolgsaussage (`IS_NATIVE_BUILD` → nicht unterstützt).

| Befehl | Exitcode | Ergebnis |
|---|---|---|
| `bunx vitest run` (gesamt, 2× nacheinander) | 0 / 0 | 43 Dateien, 521 Tests |
| `bunx tsgo --noEmit` | 0 | – |
| `bun run build` | 0 | – |
| `bun run build:native` | 0 | dist-native aus dist/client |

Neue Tests: `src/components/TripPage.test.tsx` (A→B mit verspäteter Antwort, Logout, Logout vor getSession, Kontowechsel u1→u2 ohne Zustandsübernahme, Unmount, Fehlertext, kaputte Demo-Daten, Abholort ok/error), `ActiveTrip.test.tsx` (Leiste oben + Versatz, Logout vor getSession, kein Ersatz-Abholort, bestätigter Abholort, verspäteter Geocoder), `return-reminder.test.ts` (Fehler/0 Geräte → Freigabe + späterer Versand, kein Zurücksetzen fremder Claims, kein Doppelversand).

Browser (Playwright, gemockte Sitzung + gemockte Buchungsantworten, keine Produktionsdaten): Leiste `top 0 / height 44`, Navbar `top 44 / bottom 93`, body padding-top 44 px bei 320, 390 und 1280 px; kein horizontaler Overflow. `/trip/<mock>` mit Status `returning` (390 px): ReturnFlow sichtbar, keine Leiste. Screenshots: `docs/qa-active-trip-2026-10-06/`.

Offen: kein Gerätetest iPhone/Android, kein Push-Empfangstest, keine Live-Buchung, kein Deploy. Beobachtung außerhalb des Auftrags: „App installieren“-Hinweis überdeckt auf der Fahrtseite kurzzeitig die Überschrift (unverändert).

## Nachtrag 06.10.2026 (II): Zusatzbefunde A–E der unabhängigen Prüfung

- **A Rückgabe-SQL (22P02):** Neue additive Migration `20261006005626_6c23a935-2b47-4098-b711-22e73ad475ba.sql` ersetzt `report_trip_return`; alle fünf `reasons := reasons || …` durch `array_append(reasons, …::text)` (betroffen war das unbekannte Literal bei fehlendem start_km). Übrige `||`-Ausdrücke geprüft: `covered || ARRAY[…]`, `ex || jsonb`, Text-Konkatenationen – typkorrekt. Alte Migration unverändert; Testfixture `src/test/sql/trip-return.sql` gleich angepasst. PGlite-Test: start_km NULL → ok, returning, Prüfvermerk, extra_km/charge NULL, genau eine Admin-Meldung.
- **B IndexedDB:** put/delete lösen erst bei `transaction.oncomplete` auf; `onerror`/`onabort` werfen; blockiertes Öffnen → kein Store (ehrlicher Online-Fallback); `onversionchange` schließt. „Auf diesem Gerät gespeichert“ erscheint nur für Einträge nach Commit. Test `photo-queue-idb.test.ts` mit echtem Abbruch NACH Anfrage-onsuccess.
- **C Offline-Schritte:** Dauerhaft lokal gesicherte Aufnahmen erlauben Weitergehen (Seiten, Innenraum, Tacho, Tank, Beleg); KM-Schritt geht bei Netzfehler/offline mit lokal gesichertem Entwurf weiter (Hinweis). Server zählt unverändert nur bestätigte Storage+DB-Fotos oder begründete Ausnahmen.
- **D Reconnect:** online → erst Warteschlange vollständig abarbeiten, dann eine bereits per Klick beauftragte Meldung genau einmal je Durchlauf wiederholen; bei offenen Fotos wird nicht gemeldet, sondern gewartet. Doppelklick per Ref gesperrt, Mehrfachtabs über serverseitige Idempotenz (gleicher Code). Ohne Klick keine Meldung. Status „Rückgabe ausstehend – noch nicht serverseitig bestätigt“ sichtbar.
- **E Adresse:** Karte nutzt die bestätigte Fahrzeugadresse aus `vehicles` (aktuell Poststraße 60), kein Erraten. Offen zur Klärung: Code-Schritt der Rückgabe nennt fest „Römerstraße 36“ als Schlüsselabgabe – unverändert gelassen.

| Befehl | Exitcode | Ergebnis |
|---|---|---|
| `bunx vitest run` (2×) | 0 / 0 | 45 Dateien, 530 Tests |
| `bunx tsgo --noEmit` | 0 | – |
| `bun run build` / `build:native` | 0 / 0 | – |

Neue Tests: `ReturnOffline.test.tsx` (12 Fotos + Werte offline → Reload → Reconnect → Meldung erst nach allen Uploads, genau 1×; hängender Upload + Doppelklick → automatisch genau 1×; keine Meldung ohne Klick), `photo-queue-idb.test.ts`, PGlite start_km NULL. Keine Produktionskunden, keine Benachrichtigungen, kein Deploy.
