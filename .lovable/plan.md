# Abholort bei den Transportern vereinheitlichen

## Ursache
In den Fahrzeugdaten aller Transporter ist noch „Poststraße 60, 71229 Leonberg“ gespeichert. Diese Angabe erscheint im Fahrzeug-Steckbrief als „Abholort“.

## Änderung
1. Gespeicherte Abholadresse aller Fahrzeuge auf „An der Poststraße 63, 71229 Leonberg“ setzen (nur dieses Feld, sonst nichts an Fahrzeugen, Preisen oder Buchungen).
2. Im Fahrzeug-Steckbrief statt einer Zeile zwei Zeilen zeigen:
   - **Transporter-Abholort:** „An der Poststraße 63. Bitte an keiner Haustür klingeln. Die Transporter stehen an der Straße.“
   - **Schlüsselabholort:** „Am OBI Leonberg.“
3. Kurz prüfen, dass nirgends sonst „Poststraße 60“ übrig ist.

## Technisch
- Datenupdate `vehicles.pickup_address` (alle Zeilen mit „Poststraße 60…“).
- `src/lib/vehicle-facts.ts`: Abholort-Zeile durch die beiden festen Zeilen ersetzen (Adresse aus `PICKUP_ADDRESS` in `src/lib/seo.ts`), zugehörigen Test anpassen.
- Bereits bestehende Buchungen/Rechnungen bleiben unverändert.
