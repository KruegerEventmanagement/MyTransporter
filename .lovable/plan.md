# Fahrzeugauswahl in der normalen Buchung angleichen

## Ziel
Im Schritt „Fahrzeug & Zubehör“ soll die Fahrzeugauswahl genauso aufgebaut sein wie bei der Langzeitmiete: kleine Fahrzeugkacheln oben, darunter das vollständig sichtbare ausgewählte Fahrzeug, Foto-Navigation per Wischen/Pfeilen und anschließend alle vorhandenen Fahrzeugdetails.

## Umsetzung
1. Die normale Buchungsansicht auf denselben klaren Aufbau wie die Langzeitmiete bringen und die abweichende Überschrift bzw. Einrahmung entfernen, die aktuell wie eine eigene Galerieansicht wirkt.
2. Die kleinen Fahrzeugkacheln oben gut sichtbar und horizontal nutzbar halten; Fahrzeugklasse, Kennzeichen sowie „verfügbar“/„belegt“ bleiben erhalten.
3. Das große Fahrzeugfoto vollständig mit `object-contain` zeigen. Wischen, Pfeile, Bildzähler und Foto-Vorschauen bleiben erhalten; beim Fahrzeugwechsel beginnt die Galerie wieder beim Startfoto.
4. Für jedes Fahrzeug aus den vorhandenen Fotos das seitliche Gesamtfahrzeug mit der Front nach links als Startbild verwenden. Fotos werden nicht gespiegelt oder verfälscht. Falls für ein Fahrzeug kein solches Foto vorhanden ist, wird das vollständigste vorhandene Seitenfoto verwendet und die Lücke im Ergebnis genannt.
5. Unter dem Foto weiterhin Fahrzeugname, Klasse, Kennzeichen, das fahrzeugbezogene 100-km/h-Schild und alle bestätigten Details anzeigen. Preis, Kilometerpaket, Kaution und Verfügbarkeitslogik bleiben unverändert.
6. Die Darstellung auf Desktop und schmalem Smartphone prüfen: Fahrzeug komplett sichtbar, Kacheln erreichbar, Foto-Wischen/Pfeile funktionsfähig und keine überlappenden Texte.

## Technische Leitplanken
- Die bestehende gemeinsame Fahrzeugauswahl bleibt die Grundlage; keine zweite Galerie wird eingeführt.
- Keine Änderungen an Tarifen, Kilometerlogik, Fahrzeugdaten, Buchungen, Holds oder Zahlung.
- Keine Veröffentlichung; nur Vorschau und Tests.

## Prüfung
- Komponententests für Startfoto, Fahrzeugwechsel, Bildnavigation und gesperrte Fahrzeuge ergänzen bzw. aktualisieren.
- Typprüfung, vollständige Tests und Produktions-Build ausführen.
- Den normalen Buchungsablauf lokal bis „Fahrzeug & Zubehör“ auf Desktop und Smartphone prüfen, ohne Buchung oder Zahlung auszulösen.
