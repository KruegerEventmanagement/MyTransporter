# Buchung: Fahrzeuge frei anklickbar, Pakete aufräumen, Kilometerpaket nach Schritt 1

## 1. Alle Transporter anklickbar
- Oben in der Fahrzeugauswahl kann man jetzt jedes Fahrzeug antippen, auch wenn es belegt ist, erst ab fünf Tagen buchbar ist oder nicht freigegeben ist. So kann man Fotos, Maße und Beschreibung immer lesen.
- Die Hinweise wie „verfügbar“, „belegt“, „Nur für Vermietungen ab fünf Tagen“ und „Aktuell nicht verfügbar“ bleiben sichtbar. Nicht buchbare Fahrzeuge bleiben leicht ausgegraut.
- Die Knöpfe „Vorheriger/Nächster Transporter“ springen ebenfalls durch alle Fahrzeuge.
- Buchen bleibt geschützt: „Buchen & bezahlen“ ist bei einem nicht buchbaren Fahrzeug weiter gesperrt, und darunter stehen wie bisher freie Alternativen. Die Prüfung beim Bezahlen bleibt unverändert.

## 2. Pakete aufräumen
- Die Paket-Karten selbst bleiben.
- Entfernt werden die zwei Textkästen darunter: „Die Pakete sind optional und nur nach Verfügbarkeit buchbar. Zubehör muss vollständig …“ und „Viele große Anbieter bieten Umzugszubehör oder Hilfe nur als teures Extra an …“.
- Der Inhalt des ersten Kastens (optional, nach Verfügbarkeit, Zubehör vollständig zurückgeben) kommt als kurzer Punkt in die AGB. Der Werbesatz entfällt ganz.

## 3. Individuelles Kilometerpaket in Schritt 1
- Das Kilometerpaket verschwindet aus der Fahrzeugseite.
- In Schritt 1 erscheint es direkt unter dem gewählten Tarif (3 Std., 6 Std., 24 Std. usw.): Freikilometer des Tarifs, die Vorteilspakete (z. B. 3 Std. mit 150 km) und das Feld für eigene Kilometer.
- Da das Fahrzeug in Schritt 1 noch nicht feststeht, wird der Preis zunächst für den kurzen Transporter angezeigt, mit dem Satz „Beim langen Transporter etwas mehr“. Der endgültige Preis steht wie bisher in der Zusammenfassung von Schritt 2.
- Preise, Kilometerregeln und Bezahlung bleiben exakt gleich, nur der Platz ändert sich.

## Technische Details
- `VehiclePicker.tsx`: `onSelect` und die Vor-/Zurück-Knöpfe ignorieren `disabled` nicht mehr; `disabled` wirkt nur noch optisch wie `dimmed` (kein `disabled`-Attribut). `canProceedStep2` sperrt weiterhin.
- `BookingSection.tsx`: `ADDON_NOTE`/`ADDON_TRUST` Blöcke entfernen; `<CustomKmCard>` in Schritt 1 unter die Tarifliste verschieben (nur wenn `selectedPlanId` gesetzt), Presets und `includedKm` aus dem Plan der Standardklasse L1H1, wenn noch keine Klasse gewählt ist; Zustand `customKmEnabled/customKmInput` bleibt derselbe, damit die Serverberechnung unverändert bleibt. Weiter-Knopf in Schritt 1 bei `customKmError` sperren.
- AGB-Seite: kurzer Absatz zu Zusatzpaketen ergänzen.
