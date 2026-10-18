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
| 1 | b82259a2 | Raik | MT-202610-B82259 | (Erstfassung vorhanden) | 269,00 € |
| 2 | b071e0a5 | Alexander | MT-202610-B071E0 | (Erstfassung vorhanden) | 275,00 € |
| 3 | e8d7e5b5 | Roland | MT-202610-E8D7E5 | (Erstfassung vorhanden) | 295,00 € |
| 4 | 6dc6434d | Oleksandr | MT-202610-6DC643 | (Erstfassung vorhanden) | 249,00 € |
| 5 | a70572c3 | Franziska | MT-202610-A70572 | (Erstfassung vorhanden) | 269,00 € |
| 6 | 08080872 | Christian | MT-202610-080808 | (Erstfassung vorhanden) | 279,00 € |
| 7 | 5ce9b09f | Serissa | MT-202610-5CE9B0 | (Erstfassung vorhanden) | 279,00 € |
| 8 | e28cebad | Michael | MT-202610-E28CEB | (Erstfassung vorhanden) | 279,00 € |
| 9 | cb5644d6 | Sabrina | MT-202610-CB5644 | (Erstfassung vorhanden) | 249,00 € |
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
