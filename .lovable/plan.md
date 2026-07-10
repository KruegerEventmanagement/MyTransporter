Countdown beim Dokumentenscan entfernen und manuellen Auslöser einbauen

Ziel: Beim Scannen von Führerschein und Personalausweis soll kein automatischer 3-2-1-Countdown mehr laufen. Stattdessen sieht der Nutzer sofort den Kamera-Auslöser und drückt selbst, sobald das Dokument richtig positioniert ist.

Änderungen in `src/components/DocumentScanner.tsx`:
- Scan-Phase `"countdown"` entfernen (Typ, State, Effekt, UI).
- `countdown`-State und der dazugehörige `setInterval`-Effekt werden gelöscht.
- `startCountdown()` wird entfernt; der bisherige Auslöser-Button ruft direkt `runCapture()` auf.
- Im Kamera-Overlay wird die große Countdown-Zahl entfernt.
- Anleitungstext anpassen: Statt "Ruhig halten..." / Countdown-Text wird dauerhaft "Positionieren, dann Auslöser drücken" angezeigt.
- Der weiße Auslöser-Knopf bleibt im unteren Bereich der Kamera-Ansicht sichtbar und ist jederzeit betätigbar.
- `phase === "camera"` bleibt die einzige aktive Aufnahmephase vor dem Preview.

Nicht betroffen:
- `CameraCapture.tsx` (für Fahrzeug-/Schaden-/Belegfotos) bleibt unverändert, da der Nutzer nur Dokumentenscan meinte.
- Preview, Upload, Fehler- und Verifiziert-Zustände bleiben gleich.

Ergebnis: Nutzer positioniert das Dokument frei und drückt selbst auf den Auslöser. Keine automatische Aufnahme mehr.