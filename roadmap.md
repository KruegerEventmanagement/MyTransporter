# Roadmap

## Autorisierter Einzel-Nachversand 18.10.2026
- [x] PDF-MIME korrigieren und gezielt testen, archivierte Dateien unverändert.
- [x] Zwölf Rechnungen einzeln mit aktuellen Statusprüfungen und Gmail-Fence nachsenden; alte Providerbindungen erhalten.
- [x] Erste Gmail-Nachricht samt PDF nachlesen, danach übrige einzeln abarbeiten.
- [x] Fatihs eingewilligte, vergangene Miete einzeln prüfen und Bewertungsmail senden; globale Review-Aktivierung aus lassen.
- [x] Veröffentlichung und erfolgreichen geschützten Live-Job prüfen, Ergebnisse dokumentieren.

## Mail-Automationsumfang 17.10.2026
- [x] Gmail verknüpft; read-only Profil bestätigt info@mytransporter.org und Sendeberechtigung; Adapter mit unabhängigem Gmail-Fencing, Versandfreigabe aus.
- [x] Rückgabemail ab Ende−30 Minuten für Online/angeforderte manuelle Kundenmieten, konkrete Pflichtfotos, Ablaufprüfung; keine vergangenen Erinnerungen.
- [x] Bestehende Bestätigung/Rechnung/Review geprüft; unabhängige Rechnungs-Recovery ergänzt, Nachholzähler nur gelesen; keine Replays.
- [x] DOB/Einwilligung/Coupons geprüft; Geburtstagsversand gesperrt, vorhandene Couponvalidierung unverändert.
- [x] Vorhandene Jobs bewahrt, keine Doppeljobs/Replay; Kundenmail-Cron und Review-Start bleiben inaktiv.
- [x] 831 Tests inkl. tatsächlicher Gmail-Migration; automatische Typ-/Buildprüfung und QA-Bericht.
- [ ] Extern blockiert: Geburtstagspromotion benötigt separaten Marketingdienst; kein Geburtstagsversand über App-Mails.
- [ ] Freigabe offen: unabhängiger Code-Review, sichere Entscheidung je altem Resend-Auftrag, Gmail-Sendefreigabe und Veröffentlichung; keine echte Versand-End-to-End-Prüfung erfolgt.

## Gmail-Vorbereitung 17.10.2026
- [x] Gmail-App-Verbindung erstellt, verknüpft und Konto/Berechtigungen lesend bestätigt; Aktivierung weiterhin gesperrt.

## Buchungsmails 17.10.2026
- [x] Nachprüfung: überholte manuelle Bestätigungen und historische Online-Statuswechsel gesperrt; 798 Regressionstests bestanden.
- [x] Produktionsfehler getrennt nach Kunden-/Admin-/Owner-Mail belegt.
- [x] Dauerhafte Versandabsicht, unveränderliche Inhalte und sichere Wiederholungen ergänzt (kein Altbestands-Replay).
- [x] 794 Tests, automatische Typ-/Buildprüfung und QA-Bericht abgeschlossen.
- [ ] Extern blockiert: gültigen RESEND_API_KEY sicher ersetzen; Resend-Domain/Quota im Eigentümerkonto bestätigen; geprüften Code veröffentlichen.

## Erledigt
- [x] Registrierung: Pflichtfeld Geburtsdatum, Mindestalter 25 (kalendergenau), Speicherung in user_metadata + profiles, Admin-Mail mit Geburtsdatum/Alter
- [x] Neue Nav-Kategorie „Langzeitmiete" + Route /langzeitmiete mit animiertem Preisrechner (ab 7 Tagen, 10 % Rabatt, Kaution separat)
- [x] Unit-Tests Alter + Langzeitpreis (65 Tests grün), Typecheck, Produktionsbuild

## Offen (extern blockiert)
- [x] Admin-Push VAPID-Konfigurationsfehler (Push-Schlüssel serverseitig) — braucht gültige VAPID-Zugangsdaten

- [x] AdSense-Vorbereitung: zentrale Konfiguration (deaktiviert, keine IDs), Werbespalten-Komponenten fail-closed, Ausblenden in transaktionalen Schritten, Abschnitt Online-Werbung auf /werbung, docs/adsense-activation.md
- [x] AdSense-Verifizierung: Publisher-ID ca-pub-6974851907377988 eingetragen (enabled=false), Meta-Tag + ads.txt angelegt; Inhaberschaft von Google bestätigt
- [x] AdSense-Konto: Review angefragt (Status „Wird vorbereitet“, nicht freigegeben), Zahlungsempfängerdaten übermittelt, EU-Einwilligungsmeldung veröffentlicht (DE+EN, Zustimmen/Ablehnen/Verwalten), echte Slot-IDs railLeft 4238348588 / railRight 6950298526 in der Konfiguration; Anzeigen nicht live
- [x] AdSense-Browser-Adapter umgesetzt: echte Google-Einwilligungsmeldung (Funding Choices/TCF v2.2), getrennter CMP-Bootstrap mit pauseAdRequests=1, Vendor 755 + Zwecke, NPA-Fall, reaktive Rails, Widerrufs-Button „Datenschutz für Werbung“, CMP-only-QA-Modus, mit Mocks getestet; im Normalbetrieb weiterhin keine Google-Anfrage
- [x] AdSense-Aktivierung extern blockiert: Google-Review-Ergebnis abwarten, danach echte Google-CMP-/Script-Integration im Browser (Deadlock-Reihenfolge beachten), Live-QA auf der öffentlichen Domain (Zustimmen/Ablehnen/Widerruf/Timeout, Anzeigen-Rendering), dann liveCmpVerified=true und enabled=true

## QA 29.09. (nur lesend)
- [x] Google-EU-Meldung im QA-Modus geprüft: Script 200, aber keine Meldung, __tcfapi undefined
- [x] Live-Bundles: alle vier Werbe-Schalter false, live bestätigt

## Foto-Reparatur 29.09. (genehmigt, nicht veröffentlichen)
- [x] Review-Punkte 1–5: nativer Wechsel stoppt Streams, play()-Zeitlimit, Generation-Token, reproduzierbarer Typecheck, weitere Tests + Doppel-Eintrag-Schutz
- [x] Gesamttests, Typprüfung, Build, Browsercheck, docs/qa-camera-2026-09-29.md

- [x] Mehrkilometersatz 0,45 € überall – durch Auftrag „Individuelles Kilometerpaket“ (45/35/29 ct) ersetzt und zurückgenommen
- [x] Individuelles Kilometerpaket in normaler Buchung (UI, Checkout, Webhook, Rückgabe, Storno, QA)
- [x] 0,45 € wiederhergestellt, Paket-Tests angepasst, Rechnung (Mock) geprüft
- [x] Review 3a996fdf-Lücken behoben
- [x] Awin-Ausbau: 16 verifizierte Angebote exakt 8/8 ausschließlich in Desktop-Seitenleisten, ohne Inline-/Mobile-Platzierung oder Vorab-Anfragen
- [x] Awin-Erweiterung tesa (117567): Original-Textlink „tesa“ als 9. linke Karte, 17 Marken 9/8, clickref befüllt statt angehängt

- [x] Aktive Fahrtansicht: globale Leiste "Sofort zurückkehren", wiederherstellbare Fahrt/Rückgabe, Kartenfixes, Fotoqueue, serverseitige idempotente Rückgabemeldung, 10-Minuten-Erinnerung (QA: docs/qa-active-trip-2026-10-05.md)

## Android/Play (05.10.2026)
- [x] Build-Shell, SDK 36/AGP 8.10.1, Versionierung, Env-Signierung, Android-CI + Play-Upload-Job, Berechtigungen, robuster Start, stabile ServerFn-IDs, öffentliche Kontolöschung
- [x] Gradle-Lauf in GitHub (wartet auf ersten Workflow-Lauf)
- [x] Play-Secrets/erster manueller Upload (wartet auf Nutzer)
- [x] Nativer Push-Versand (wartet auf Firebase)

## Datenschutz/Konto (06.10.2026, nicht veröffentlicht)
- [x] Passwort vergessen in allen Logins + /reset-password
- [x] Echte Kontolöschung mit Audit, Löschantrag bei offener Miete, Admin-Tab „Löschungen“
- [x] Ausweis/Führerschein aus Konto entfernen, befristetes Adminarchiv, Bereinigungs-Hook
- [x] Zeitplan für /api/public/hooks/purge-document-archive (wartet auf Freigabe)
- [x] Erlaubte Weiterleitungsadressen für /reset-password in den Anmeldeeinstellungen bestätigen

## Kunden-Mails Review 15.10.2026
- [x] CID-Maps-Link erlauben, Vorschau mit echtem Link
- [x] Neutraler Betreff „Deine Erfahrung mit MyTransporter“
- [x] DB-Fehler bei Opt-out/Storno/Profil ⇒ retrybar, Opt-out-POST nur bei gespeichertem Eintrag
- [x] Sweep per Anti-Join/Paginierung; Due-Queue ohne Backoff/aktive Leases
- [x] Erinnerungen mit Lease+Token, gefrorener Payload, 23h-Grenze
- [x] SQL-Tests mit pglite aus echter Migration
