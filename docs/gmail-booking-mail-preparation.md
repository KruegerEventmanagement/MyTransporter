# Gmail-Buchungsmails – Vorbereitung 17.10.2026

## Stand
Kein Gmail-App-Connector im Workspace verfügbar (lesende Connector-Auflistung). Der Lovable Gmail **App**-Connector unterstützt serverseitige Automation aus dem verbundenen Workspace-Konto; keine individuelle Kunden-OAuth-Verbindung oder eigene SMTP-Lösung nötig.

- `mail-provider.ts`: gemeinsamer Versandvertrag.
- `resend-mail-provider.server.ts`: unveränderter bisheriger Resend-Versand, Fehlerklassifikation, Timeout und Idempotency-Key.
- `mail-provider.server.ts`: gemeinsamer Zugang, Resend weiter fest ausgewählt; Gmail absichtlich gesperrt. Keine Umgebungsvariable schaltet automatisch um, kein Fallback nach Fehler.
- `gmail-mail-format.ts`: vorbereitete RFC-2822/MIME-Nachrichten, UTF-8-Anzeigename/Betreff, Text+HTML, archivierte PDF-Bytes und Abmeldekopfzeilen. From/Reply-To info@mytransporter.org, Anzeigename Christian Krüger – MyTransporter.
- Online-Kunden-/Adminmails, Buchungsrechnungen, manuelle Bestätigungen und bestehende Erinnerungen behalten ihren bisherigen Zugang über `sendEmailDetailed`, einschließlich Outbox/Lease/Fencing/Protokollierung. Stripe bleibt browserunabhängig. Andere Features und separate manuelle Dokumenten-/Testendpunkte unverändert.

## Verbindungsaktion
Gmail-App-Verbindung in Lovable erstellen, dabei **info@mytransporter.org** auswählen:
https://lovable.dev/connectors/google_mail/connect?workspace=i3iIdvfG4hOUHq2Dme4e

Danach Verbindung mit dem Projekt verknüpfen, gewährtes `gmail.send` und authentifiziertes Konto read-only prüfen. `/gmail/v1/users/me/profile` benötigt einen gewährten Lesescope (gegebenenfalls `gmail.readonly` zusätzlich freigeben). Bei anderem Konto nicht umschalten. Die konkreten Secret-Namen und Gateway-Variante erst aus der erfolgreichen Verknüpfung übernehmen. Keine Gateway-Aufrufe vor Verknüpfung, keine Provider-Tokens im Browser.

## Sicherheit vor späterer Aktivierung
Gmail `messages.send` hat **keine Resend-Idempotency-Key-Garantie**. Message-ID ist eine Quellkennung, keine Dublettensperre. Deshalb bleibt der Gmail-Transport bis zur Verbindung und einer separaten Freigabe gesperrt. Vor Aktivierung zusätzlich nötig:

- Dauerhaft eingefrorenen Provider je Versandabsicht und providergebundene Claims ergänzen. Erfolgreiche oder unklare Resend-Absichten nicht zu Gmail verschieben.
- Gmail in-flight/unklare Versuche, Timeout, HTTP 5xx, fehlende Nachrichten-ID oder angenommen-aber-nicht-gespeichert niemals blind wiederholen, auch nicht innerhalb von 23 Stunden; erst sichere Klärung/manuelle Prüfung.
- Nur eindeutige Nichtannahme kontrolliert wiederholen. Erfolg nur mit Gmail-Nachrichten-ID (Annahme, nicht Zustellung).
- Kein Queue-Replay oder neue Cron-Aktivierung. Kunden-/Adminmails unabhängig erhalten.

Der tatsächliche serverseitige Gmail-Gateway-Aufruf und providergebundene Claim-Erweiterungen sind bewusst noch nicht implementiert: Die Connector-Regeln verlangen zuerst die Verknüpfung. Der Wechsel ist vorbereitet, **noch nicht als Gmail-Versand aktivierbar**. Google-Workspace-Richtlinien, tatsächliche Quota und Konto-Zuordnung sind bis zur Verbindung ungeprüft. Kein Kauf/Upgrade vorgenommen.

## Prüfung
807 Tests in 68 Dateien bestanden, darunter 134 gezielte Mail-/Outbox-/SQL-/Action-Regressionstests. Neue Tests simulieren nur Antworten und prüfen gesperrten Gmail-Versand ohne Netzaufruf, weiterhin ausgewähltes Resend, kein Fallback, Zielkonto/UTF-8/PDF/Abmeldung und Injection-Abwehr. Automatische Typprüfung/Produktionsbuild meldeten `build OK` um 17:44:03 UTC. Keine echten Mails, Buchungen, Zahlungen, Connector-Verknüpfung, Queue-Replays, Migration oder Veröffentlichung. Live-Gmail-Versand nicht geprüft.