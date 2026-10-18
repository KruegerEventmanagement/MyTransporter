# Runbook: Gmail-Rechnungsautomatik aktivieren (Stand 18.10.2026, nicht aktiviert)

## Blocker (menschliche Freigabe)
Die zwei internen TEST-Mails an info@mytransporter.org laufen über die Lovable-Aktion
„Gmail-Verbindung aufrufen" (Gmail `POST /users/me/messages/send` über die verbundene
Google-Mail-Verbindung). Schreibende Aufrufe benötigen eine Freigabe im Lovable-Chatfenster
des Projekts („Erlauben" / „Immer erlauben"). In dieser Sitzung ist keine Freigabekarte offen.
Kein anderer Versandweg (Resend, SMTP, Skript) wird zur Umgehung verwendet.

## Vorarbeiten erledigt
- Absender fest in `gmail-mail-format.ts`: `Christian Krüger – MyTransporter <info@mytransporter.org>`, Reply-To info@mytransporter.org; Kontoprüfung `users/me/profile` vor jedem Versand (fail-closed).
- Fehler behoben: Rechnungen wurden im Server immer als „Konto nicht aktiv" blockiert (`is_account_active` vergleicht mit auth.uid()). Neu: `isAccountActiveForMail` (Test `mail-account-active.test.ts`).
- Alt-Outbox: keine Zeile `scheduled/sending/failed`. Manuell 65774a2c (Archiv 05dd18aa, 480 €) gesperrt. Betroffene Online-Rechnungen von Fatih/Celine/Sabri bleiben `blocked` (werden nicht automatisch neu bewertet).
- Gates: `GMAIL_SEND_RELEASED=false`, `RESEND_FALLBACK_RELEASED=false`, Cron `mt-process-customer-mails` inaktiv.

## Aktivierung (nur nach erfolgreichen TEST-Mails mit Nachrichten-ID, From/Reply-To, MIME, PDF geprüft)
1. Code: `src/lib/gmail-mail-provider.server.ts` → `GMAIL_SEND_RELEASED = true`. Resend bleibt `false`.
2. Daten (gleicher Moment, schließt Altbestand aus):
   `update customer_mail_settings set invoice_outbox_from = now(), updated_at = now() where id;`
   `review_requests_from` bleibt NULL.
3. Prüfen: keine `customer_mail_outbox`-Zeile in `scheduled` mit `created_at < invoice_outbox_from`.
4. Veröffentlichen.
5. Cron: `select cron.alter_job((select jobid from cron.job where jobname='mt-process-customer-mails'), active := true);` (alle 5 Min., geschützt per x-hook-token).
6. Erste neue Buchung beobachten: Outbox `sent` + provider_message_id.

## Rückweg
Cron deaktivieren, `GMAIL_SEND_RELEASED=false`, veröffentlichen. Unklare Versuche (`needs_review`/ambiguous) nie automatisch wiederholen.

## Altbestand – exakt 12 verifizierte Rechnungsaufträge (noch nicht gesendet)
Jeweils: Status paid, Empfänger = Profil-E-Mail (Beleg-E-Mail abgeglichen), keine Kontolöschung, keine Abmeldung, kein Gmail-/Providerversuch, kein „Rechnung versendet“, frühere Resend-Versuche eindeutig abgelehnt (401) – kein unklarer Versand. Nur archivierte Erstfassung anhängen, nichts neu berechnen.

| # | Buchung | Kunde | Rechnungsnr. | Archiv-ID | Gesamt |
|---|---|---|---|---|---|
| 1 | b82259a2 | Raik | MT-202610-B82259 | 98b831fd-2abd-4659-a89e-7d2f08d099b9 | 269,00 € |
| 2 | b071e0a5 | Alexander | MT-202610-B071E0 | efdfbe63-4182-46a9-89b2-999279c968ce | 275,00 € |
| 3 | e8d7e5b5 | Roland | MT-202610-E8D7E5 | 42cec7d8-eb5d-40d2-933d-76b7c6122388 | 295,00 € |
| 4 | 6dc6434d | Oleksandr | MT-202610-6DC643 | bc3979b3-12b1-4000-bb91-926d1b26ce69 | 249,00 € |
| 5 | a70572c3 | Franziska | MT-202610-A70572 | 317f0116-d171-4e76-97fc-5d3d3454760b | 269,00 € |
| 6 | 08080872 | Christian | MT-202610-080808 | 33401471-f082-4b49-8c01-007ab6694ed8 | 279,00 € |
| 7 | 5ce9b09f | Serissa | MT-202610-5CE9B0 | 439adff1-5e9f-4606-bf62-2885a456cec7 | 279,00 € |
| 8 | e28cebad | Michael | MT-202610-E28CEB | 3e8c29e2-cb3a-4ab3-afa1-15f5df2111a7 | 279,00 € |
| 9 | cb5644d6 | Sabrina | MT-202610-CB5644 | 912d7862-07d5-4826-8138-110187647483 | 249,00 € |
| 10 | 14c3fc50 | Fatih | MT-202610-14C3FC | 20d84331-74a8-4a57-a5b3-15cd7a7f1d35 | 249,00 € (49 Miete + 200 Kaution) |
| 11 | 96209254 | Celine | MT-202610-962092 | 70e4ce1e-fa10-4460-85f4-5cf66175c476 | 269,00 € (69 + 200) |
| 12 | 4f8ac252 | Sabri | MT-202610-4F8AC2 | 88add76a-9730-4df3-83b4-58fec26a121a | 269,00 € (69 + 200) |

Nr. 10–12 am 18.10.2026 einmalig mit regulärem Renderer + archiveIssuedDocument aus gespeichertem Buchungs-Snapshot erzeugt (vorher 0 Belege, Revision 1, PDF 1 Seite, Inhalt geprüft). Deren Outbox-Zeilen stehen noch auf `blocked` („Konto nicht aktiv“, alter Prüffehler) und werden erst beim Nachversand bewusst einzeln freigegeben.
**Nicht senden:** Ali Elkassem (manuell, per Gmail korrigiert), Jochen Gast (per Gmail), Tanja (storniert).
**Nachversand nach Freigabe:** pro Auftrag einzeln über die Outbox mit archivierter Erstfassung, Gmail-Nachrichten-ID protokollieren; kein Sammel-Replay.

## Bewertungs-Nachversand – Kandidaten (nicht eingeplant)
Rückwirkend jetzt: **nur Fatih (14c3fc50)** – Einwilligung online 17.10., Miete 17.10. (3h) vorbei, keine Abmeldung.
Noch nicht rückwirkend: d7d37bfa (Jochen, Miete 20.10.) und 65774a2c (Ali, manuell, Miete bis 25.10.) – erst regulär nach Mietende.
Alle anderen Buchungen: keine dokumentierte Einwilligung → keine Bewertungsmail. Einwilligungen/Abmeldungen unverändert.

## Aktivierung durchgeführt 18.10.2026
- TEST 1/2 ohne Anhang: Gmail-ID 1a14f7c7485ea49b. TEST 2/2 mit Muster-PDF: Gmail-ID 1a14f7d3e69b8a14. Beide nur an info@mytransporter.org; From „Christian Krüger – MyTransporter" <info@mytransporter.org>, Reply-To info@mytransporter.org, multipart/mixed mit text/plain+text/html, Anhang TEST-Muster-kein-Beleg.pdf (974 B) nachgelesen.
- `GMAIL_SEND_RELEASED = true`, Resend bleibt aus. `invoice_outbox_from` = 2026-10-18 14:50:22 UTC. Veröffentlichung angefordert, Cron `mt-process-customer-mails` aktiv (5 Min.).
- Alt-Aufträge bleiben gesperrt; der wartende Bestätigungsauftrag zu Ali (manuell 65774a2c) ist an den abgeschalteten alten Weg gebunden und wird nicht über Gmail gesendet.
- Nachversand am 18.10.2026 ausgeführt; Ergebnisse unten.

## Nachversand ausgeführt 18.10.2026

Alle zwölf Rechnungen individuell nach erneuter Prüfung von paid-Status, aktivem Konto, Profil-/Belegempfänger, Archiv-Erstfassung und Versandstatus gesendet; keine neue Rechnung/Zahlung. Alle 13 Nachrichten in Gmail nachgelesen, From/Reply-To korrekt. Gmail-Annahme ist kein Nachweis der Zustellung im Empfängerpostfach.

| Empfänger | Rechnung | Gmail-ID | Status |
|---|---|---|---|
| raik.schnabel@gmail.com | MT-202610-B82259 | 1a14f9009aef0a31 | sent, nachgelesen |
| alexanderays@googlemail.com | MT-202610-B071E0 | 1a14f905cbcdfb5b | sent, nachgelesen |
| rzell@gmx.de | MT-202610-E8D7E5 | 1a14f90688331c8e | sent, nachgelesen |
| r.type.zx@gmail.com | MT-202610-6DC643 | 1a14f9079468e58e | sent, nachgelesen |
| franzi.zp@web.de | MT-202610-A70572 | 1a14f90873ea7dfb | sent, nachgelesen |
| christian.popi@freenet.de | MT-202610-080808 | 1a14f90929dba4b5 | sent, nachgelesen |
| serissa.matejka@web.de | MT-202610-5CE9B0 | 1a14f909c9965d2e | sent, nachgelesen |
| mi-nagy@t-online.de | MT-202610-E28CEB | 1a14f90aabdef1ae | sent, nachgelesen |
| sabrina-nadine@gmx.de | MT-202610-CB5644 | 1a14f90b63f38fd7 | sent, nachgelesen |
| fatih.cirak61@googlemail.com | MT-202610-14C3FC | 1a14f90c3819957f | sent, nachgelesen |
| ckerzinger@web.de | MT-202610-962092 | 1a14f90d12f90205 | sent, nachgelesen |
| sabritrad0@gmail.com | MT-202610-4F8AC2 | 1a14f90e5d77ba71 | sent, nachgelesen |
| fatih.cirak61@googlemail.com | Bewertungsanfrage Fatih | 1a14f90f70148f6b | sent, nachgelesen |

- Neun neue Gmail-Rechnungsoutboxzeilen und Fatihs Review stehen auf sent. Drei alte Resend-Zeilen bleiben blocked und unverändert: individueller autorisierter Versand über sendViaGmail mit demselben logischen Idempotenzschlüssel und mail_provider_attempts-Fence; separate Rechnung-versendet-Protokolle enthalten Gmail-ID/Archiv. Nicht umetikettieren oder replayen.
- Alle archivierten PDFs unverändert; erster Gmail-Anhang (Raik, 278286 Bytes) heruntergeladen und bytegleich zum Archiv. Alle zwölf Anhänge application/pdf.
- Fatih: Einwilligung, kein Opt-out, vergangenes Mietende und 24h-Abstand geprüft; bestätigte CID-URL und List-Unsubscribe nachgelesen. review_requests_from bleibt NULL. Ali, Jochen und Tanja ausgeschlossen.
- Live mytransporter.org HTTP 200; geschützter Rechnungsjob HTTP 200, ok:true, processed:0, failed:0; ohne Token HTTP 401. Cron job 8 aktiv alle fünf Minuten, letzte drei Ausführungen erfolgreich. Keine pauschale Review-Aktivierung.
- MIME-Korrektur: src/lib/gmail-mail-format.ts, Test src/lib/mail-provider.test.ts. 33 gezielte Tests bestanden, automatische Buildprüfung build OK. Veröffentlichung der MIME-Korrektur folgt gesondert.
