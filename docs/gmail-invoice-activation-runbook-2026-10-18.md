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

## Altbestand – lesende Prüfung (keine Sendung, keine Neuberechnung)
Alle 9 mit archivierter Erstfassung: Status paid, E-Mail vorhanden, keine Kontolöschung, keine Abmeldung, `customer_invoice` failed (Resend 401 = eindeutig nicht angenommen), keine Gmail-/Provider-Versuche, kein „Rechnung versendet".
**Sicher bereit (nach Freigabe, einzeln, mit archivierter Erstfassung):**
b82259a2 Raik MT-202610-B82259 269 € · b071e0a5 Alexander MT-202610-B071E0 275 € (7 Versuche, alle abgelehnt) · e8d7e5b5 Roland MT-202610-E8D7E5 295 € · 6dc6434d Oleksandr MT-202610-6DC643 249 € · a70572c3 Franziska MT-202610-A70572 269 € · 08080872 Christian MT-202610-080808 279 € · 5ce9b09f Serissa MT-202610-5CE9B0 279 € · e28cebad Michael MT-202610-E28CEB 279 € · cb5644d6 Sabrina MT-202610-CB5644 249 €.
**Konkret blockiert:** 14c3fc50 Fatih, 96209254 Celine, 4f8ac252 Sabri – noch kein archivierter Beleg; Outbox `blocked` „Konto nicht aktiv" durch obigen Fehler (Konten tatsächlich aktiv). Vor Versand: Beleg einmalig mit regulärer Erzeugung archivieren (keine Preisänderung), danach separat freigeben.
**Ausgeschlossen:** Ali Elkassem (manuell, bereits per Gmail), Jochen Gast (bereits per Gmail), Tanja (storniert).

## Bewertungs-Nachversand – Kandidaten (nicht eingeplant)
Gespeicherte Einwilligung, keine Abmeldung, keine Bewertungs-Outbox:
- d7d37bfa online, Einwilligung 16.10., Mietbeginn 20.10. → frühestens nach Miete.
- 14c3fc50 Fatih online, Einwilligung 17.10., Miete 17.10. (3h) → Kandidat.
- 65774a2c manuell (Ali), Einwilligung 18.10., Miete 18.10. → Kandidat, Zeitpunkt mit Betreiber abstimmen.
Alle anderen Buchungen: keine dokumentierte Einwilligung → keine Bewertungsmail.
