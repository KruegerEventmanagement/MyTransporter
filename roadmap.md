# Roadmap

## Erledigt
- [x] Registrierung: Pflichtfeld Geburtsdatum, Mindestalter 25 (kalendergenau), Speicherung in user_metadata + profiles, Admin-Mail mit Geburtsdatum/Alter
- [x] Neue Nav-Kategorie „Langzeitmiete" + Route /langzeitmiete mit animiertem Preisrechner (ab 7 Tagen, 10 % Rabatt, Kaution separat)
- [x] Unit-Tests Alter + Langzeitpreis (65 Tests grün), Typecheck, Produktionsbuild

## Offen (extern blockiert)
- [ ] Admin-Push VAPID-Konfigurationsfehler (Push-Schlüssel serverseitig) — braucht gültige VAPID-Zugangsdaten

- [x] AdSense-Vorbereitung: zentrale Konfiguration (deaktiviert, keine IDs), Werbespalten-Komponenten fail-closed, Ausblenden in transaktionalen Schritten, Abschnitt Online-Werbung auf /werbung, docs/adsense-activation.md
- [x] AdSense-Verifizierung: Publisher-ID ca-pub-6974851907377988 eingetragen (enabled=false), Meta-Tag + ads.txt angelegt; Inhaberschaft von Google bestätigt
- [x] AdSense-Konto: Review angefragt (Status „Wird vorbereitet“, nicht freigegeben), Zahlungsempfängerdaten übermittelt, EU-Einwilligungsmeldung veröffentlicht (DE+EN, Zustimmen/Ablehnen/Verwalten), echte Slot-IDs railLeft 4238348588 / railRight 6950298526 in der Konfiguration; Anzeigen nicht live
- [x] AdSense-Browser-Adapter umgesetzt: echte Google-Einwilligungsmeldung (Funding Choices/TCF v2.2), getrennter CMP-Bootstrap mit pauseAdRequests=1, Vendor 755 + Zwecke, NPA-Fall, reaktive Rails, Widerrufs-Button „Datenschutz für Werbung“, CMP-only-QA-Modus, mit Mocks getestet; im Normalbetrieb weiterhin keine Google-Anfrage
- [ ] AdSense-Aktivierung extern blockiert: Google-Review-Ergebnis abwarten, danach echte Google-CMP-/Script-Integration im Browser (Deadlock-Reihenfolge beachten), Live-QA auf der öffentlichen Domain (Zustimmen/Ablehnen/Widerruf/Timeout, Anzeigen-Rendering), dann liveCmpVerified=true und enabled=true

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
