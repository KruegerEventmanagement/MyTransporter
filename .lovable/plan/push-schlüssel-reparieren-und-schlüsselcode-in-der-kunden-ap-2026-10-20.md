# Push-Schlüssel reparieren und Schlüsselcode in der Kunden-App

## 1. Push-Benachrichtigungen (Befund)
Der hinterlegte private Push-Schlüssel ist ungültig: Er ist nur 12 Zeichen lang und enthält unerlaubte Zeichen. Ein echter Schlüssel hat 43 Zeichen. Deshalb kommt seit Wochen kein Push an. Der Wert selbst wurde nicht angezeigt.

Lösung:
- Ein neues, zusammenpassendes Schlüsselpaar wird erzeugt. Der private Teil wird als neues sicheres Geheimnis gespeichert, der öffentliche Teil kommt in die App.
- Folge: Bereits angemeldete Geräte müssen Push einmal neu einschalten (Admin → Benachrichtigungen aktivieren). Danach kommen Push-Nachrichten wieder an.
- Ein Test-Push wird erst gesendet, wenn du ihn ausdrücklich erlaubst.

## 2. Abholbildschirm in der Kunden-App
- Der alte Text „nenne einem Mitarbeiter diesen Code“ wird komplett entfernt.
- Ab 15 Minuten vor Abholung erscheint automatisch der echte Schlüsselcode des gebuchten Fahrzeugs.
- Darunter: Schlüssel beim OBI Leonberg vor dem Eingang an den Fahrradständern, Transporter in der Poststraße 60 (ca. 500 m), eigenes Auto darf auf dem Transporter-Parkplatz stehen.
- Vorher steht dort: „Dein Schlüsselcode erscheint hier 15 Minuten vor der Abholung und kommt zusätzlich per E-Mail.“

## Technische Details
- Neues Secret `VAPID_PRIVATE_KEY_V2` per set_secret; `push.functions.ts` liest V2 bevorzugt, `push-config.ts` bekommt den neuen öffentlichen Schlüssel. Altes Secret bleibt unangetastet.
- Neue Serverfunktion (requireActiveAccount): prüft, dass die Buchung dem Kunden gehört, bezahlt/aktiv ist und `isKeyCodeDue` zutrifft; erst dann wird der Code aus `vehicle_key_codes` serverseitig gelesen. Vorher wird nie ein Code ausgeliefert.
- `PreDriveFlow.tsx` nutzt `KEY_PICKUP_PLACE`/`VEHICLE_PICKUP_PLACE`/`KEY_HANDOVER_HINTS` aus `key-handover.ts`; `pickup_code` bleibt nur Buchungsreferenz.
- Tests: Code vor 15 Min. gesperrt, fremde Buchung abgelehnt, Code ab 15 Min. sichtbar. Typecheck/Build, nicht veröffentlichen.
