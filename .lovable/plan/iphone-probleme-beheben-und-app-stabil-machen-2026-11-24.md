# iPhone-Probleme beheben und App stabil machen

## Was bekannt ist
- **iPhone: endloser Ladekreis**, wenn Kunden den Foto-Link aus der Gmail-App öffnen. Die Ursache ist noch nicht gefunden. Bisher gibt es nur eine Notlösung: Nach 10 Sekunden erscheinen Knöpfe zum Neuladen und zur Buchung.
- **iPhone-Fotos (HEIC)**: Die automatischen Prüfungen für iPhone-Fotos in der Fahrzeugfoto-Kamera und im Ausweis-Scanner schlagen fehl. Dazu kommt eine Safari-Prüfung, bei der ein gespeichertes Foto kaputt ist. Ob das ein echter Fehler ist oder nur die Prüfung veraltet ist, ist noch offen.
- **Insgesamt schlagen 17 von 1132 Prüfungen fehl**: Fahrtseite (8), Rückgabe (3), iPhone-Fotos (3), Werbeleisten (2) und Fahrzeugdaten Crafter (1). Bei der Fahrtseite fehlt in der Prüfung die neue Erkennung der installierten App, sodass die Seite dort abstürzt.

## Vorgehen
1. **Gmail auf dem iPhone nachstellen**: Die Seite mit iPhone-Kennung und den Beschränkungen des Gmail-Browsers öffnen (z. B. ohne Gerätespeicher oder mit gesperrten Drittanbieter-Daten). Dabei auf Startfehler, hängende Anmeldung und blockierte Skripte achten. Ich ändere nur, was sich dabei als Ursache zeigt. Hängt die Seite, weil die Anmeldung nicht geladen werden kann, soll sie direkt die Anmeldung zeigen, statt endlos zu laden.
2. **iPhone-Fotos**: Für jede fehlschlagende Prüfung klären, ob sich die App wirklich falsch verhält. Echte Fehler werden behoben: iPhone-Fotos dürfen nie abgewiesen werden und sollen auch dann hochgeladen werden, wenn Safari den Zwischenspeicher verliert. Veraltete Prüfungen passe ich an das heutige, richtige Verhalten an.
3. **Fahrtseite und Rückgabe**: Die Prüfungen reparieren, die wegen der neuen App-Erkennung abstürzen. Danach sehen, ob dahinter echte Fehler stecken, zum Beispiel beim Logout oder bei langsamer Verbindung, und diese beheben.
4. **Werbeleisten und Crafter-Daten**: Klären, ob die Prüfung oder die App falsch ist, und das entsprechend korrigieren. Preise und Fahrzeugdaten ändere ich nicht.
5. **Gesamtprüfung**: Alle Prüfungen müssen durchlaufen. Dazu kommen ein fehlerfreier Aufbau der Website und ein Klick-Durchlauf auf Handygröße: Buchung bis zur Zahlungsseite, Fotos hochladen und Anmeldung.

## Bleibt unverändert
Preise, Zahlungen, Schutz vor doppelten Buchungen, Mails und SMS, die automatische Kontobestätigung, bestehende Buchungen und Fotos.

## Grenzen
Die echte Gmail-App auf einem iPhone kann ich nicht bedienen, nur nachstellen. Ob der Ladekreis dort ganz weg ist, zeigt sich erst bei einem Kunden oder bei einem Test mit Ihrem Handy nach dem Veröffentlichen.
