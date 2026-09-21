# Roadmap

## Erledigt
- [x] Registrierung: Pflichtfeld Geburtsdatum, Mindestalter 25 (kalendergenau), Speicherung in user_metadata + profiles, Admin-Mail mit Geburtsdatum/Alter
- [x] Neue Nav-Kategorie „Langzeitmiete" + Route /langzeitmiete mit animiertem Preisrechner (ab 7 Tagen, 10 % Rabatt, Kaution separat)
- [x] Unit-Tests Alter + Langzeitpreis (65 Tests grün), Typecheck, Produktionsbuild

## Offen (extern blockiert)
- [ ] Admin-Push VAPID-Konfigurationsfehler (Push-Schlüssel serverseitig) — braucht gültige VAPID-Zugangsdaten

- [x] AdSense-Vorbereitung: zentrale Konfiguration (deaktiviert, keine IDs), Werbespalten-Komponenten fail-closed, Ausblenden in transaktionalen Schritten, Abschnitt Online-Werbung auf /werbung, docs/adsense-activation.md
- [ ] AdSense-Aktivierung extern blockiert: echte ca-pub-/Slot-IDs, Site-Freigabe, zertifizierte CMP, ads.txt
