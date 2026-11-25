# VW Crafter (OF-DK 1234) wieder jederzeit buchbar, Abholort Grunbach-Engelsbrand

## Ausgangslage
- Der Crafter ist im System aktiv und hat keine Sperrzeiten.
- Er ist aber nur ab 5 Tagen Mietdauer buchbar. Deshalb taucht er bei kürzeren Mieten nicht auf.
- Als Abholort ist bei ihm noch Leonberg (Poststraße 63) hinterlegt.

## Änderungen
1. **Jederzeit buchbar:** Die 5-Tage-Mindestdauer für den Crafter fällt weg. Er kann mit jedem Tarif gebucht werden (24 Stunden, Wochenende, Tage usw.), Preise bleiben unverändert. Der Hinweis „Nur für Vermietungen ab fünf Tagen" verschwindet.
2. **Neuer Abholort nur für den Crafter:** 75331 Grunbach-Engelsbrand, Calwer Straße 29. Alle anderen Transporter bleiben in Leonberg.
3. **Rote Notiz:** Überall, wo Kunden den Crafter auswählen oder ihre Crafter-Buchung sehen, steht gut sichtbar in Rot: „Achtung: Abholort dieses Fahrzeugs ist 75331 Grunbach-Engelsbrand, Calwer Straße 29 – nicht Leonberg." Das ist die einzige Farbausnahme im sonst schwarz-weißen Design.
4. **Mails und Fahrtseite:** Buchungsbestätigung, Erinnerungen und die Fahrtseite nennen beim Crafter die neue Adresse statt Leonberg. Hinweise auf den Schlüsselkasten bei OBI Leonberg werden beim Crafter nicht angezeigt.
5. **Webseitentexte:** Sätze wie „auch der Crafter wird in Leonberg abgeholt" (Startseite, Pforzheim/Calw-Seite, Mietratgeber) werden korrigiert.

## Offene Frage
- Wie bekommen Crafter-Kunden den Schlüssel in Grunbach? Bis zur Antwort steht in der Mail nur „Die Schlüsselübergabe stimmen wir mit Ihnen ab", und es wird kein OBI-Code verschickt.

## Technisches
- `MIN_DAYS_BY_CLASS` leeren; `planAllowedForClass`, Verfügbarkeit und Tests anpassen; DB-Funktionen auf l5h2-Mindestdauer prüfen und ggf. per Migration angleichen.
- `vehicles.pickup_location/pickup_address` für OF-DK 1234 per Datenänderung setzen.
- Abholort in Mail/Trip/Key-Handover aus dem Fahrzeug statt aus der festen PICKUP_ADDRESS lesen, nur wo der Crafter betroffen ist; Key-SMS/Code-Mail für den Crafter aussetzen.
- Rote Notiz über einen eigenen Warn-Token in styles.css; i18n-Einträge ergänzen.
- Bestehende Buchungen, Preise und andere Fahrzeuge bleiben unverändert. Memory „Crafter Mindestdauer" und „Standort" aktualisieren.
