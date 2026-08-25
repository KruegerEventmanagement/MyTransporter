# Fahrzeugauswahl: frei wählbare Zeiten + echtes Umschalten

## Ziel
Zeitraum und Uhrzeit sind im ersten Schritt immer frei wählbar. Erst bei der Fahrzeugauswahl entscheidet sich, welcher Transporter im gewählten Fenster frei ist – beide Transporter bleiben dabei sichtbar und durchblätterbar.

## 1. Alle Zeiten wieder freigeben
- Kalender: nur Vergangenheit gesperrt. Keine komplett gesperrten Tage, keine gestrichelten Markierungen, kein Hinweistext darunter.
- Uhrzeiten: alle Stunden auswählbar (keine "Bereits gebucht"-Deaktivierung).
- Tarife: nicht mehr wegen Belegung deaktiviert.

## 2. Fahrzeugschritt
- Das automatische Umspringen auf ein freies Fahrzeug wird entfernt – man kann jederzeit links/rechts blättern und beide Fahrzeuge sehen.
- Die Fahrzeugliste unter dem Bild bleibt für beide Transporter anklickbar (nicht mehr deaktiviert/durchgestrichen); belegte Fahrzeuge werden nur ausgegraut und mit Status "nicht verfügbar" gekennzeichnet.
- Ist das angezeigte Fahrzeug im gewählten Fenster belegt, erscheint auf der Karte (Bild leicht ausgegraut):
  "Dieser Transporter ist am 05.09.2026 von 15:00 bis 18:00 Uhr nicht verfügbar." plus "Wieder verfügbar ab 06.09.2026, 09:00 Uhr" und der Hinweis, ein anderes Fahrzeug oder eine andere Zeit zu wählen.
- Wechselt man die Uhrzeit auf ein freies Fenster (z. B. 17:00 statt 10:00), verschwindet Ausgrauung und Hinweis automatisch.
- Der Weiter-Button in diesem Schritt bleibt nur gesperrt, solange ein belegtes Fahrzeug ausgewählt ist – mit dem gleichen Klartext-Hinweis.
- Die serverseitige Prüfung beim Reservieren/Bezahlen bleibt bestehen, damit trotz freier Zeitauswahl keine Doppelbuchung entstehen kann.

## 3. Bild für den L1H1
- Ein Bild wird erzeugt: weißer Citroën Jumper L1H1, kurzer Radstand, Baujahr-2007-Optik, gleiche Perspektive wie das bestehende Foto – gespeichert unter `src/assets/citroen-jumper-l1h1.jpg`.
- Fahrzeuge ohne eigenes Foto in der Datenbank verwenden ab jetzt ein passendes Standardbild (L1H1 → neues Bild, sonst bestehendes Jumper-Foto), damit im Slider immer ein Bild erscheint.

## Technische Details
- `src/components/BookingSection.tsx`: `fullyBookedDay`, `isHourBusy`, `isPlanBlocked` und die `partly`-Modifier werden aus der UI-Sperrlogik entfernt (Verfügbarkeitsdaten bleiben geladen und werden nur noch im Fahrzeugschritt genutzt). Auto-Switch-`useEffect` entfernt. Fahrzeugkarten-Buttons ohne `disabled`. Neue Hilfsfunktion für den Verfügbarkeitstext aus `selectionWindow` + `nextFreeFrom`.
- Fallback-Bildzuordnung über Kennzeichen/Name in `displayVehicle`.
- `src/lib/availability-logic.ts` und `availability.functions.ts` bleiben unverändert.
