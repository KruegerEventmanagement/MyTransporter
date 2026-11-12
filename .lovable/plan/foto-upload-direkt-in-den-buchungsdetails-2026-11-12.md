# Foto-Upload direkt in den Buchungsdetails

## Befund
Die Seite "Buchungsdetails" zeigt im Bereich "Fotos" nur vorhandene Bilder an. Dort gibt es keine Fläche zum Hochladen. Die Berechtigungen erlauben Kunden das Hochladen zur eigenen Buchung bereits; es fehlt nur die Bedienfläche.

## Was gebaut wird
Im Bereich "Fotos" der Buchungsdetails kommen zwei große, immer aktive Schaltflächen dazu:
- **Foto aufnehmen**: öffnet sofort die Handykamera.
- **Aus Galerie wählen**: wählt ein oder mehrere vorhandene Fotos aus (JPEG, PNG, WebP, HEIC von iPhones).

Dazu gilt:
- Pro Foto ist ein Fortschritt sichtbar, Fotos werden nacheinander hochgeladen.
- "Gespeichert" erscheint erst, wenn das Foto wirklich auf dem Server liegt. Bei Fehlern gibt es eine klare Meldung und "Erneut versuchen".
- Neue Fotos erscheinen sofort in der Liste und bleiben nach dem Neuladen sichtbar.
- Die Fläche erscheint bei bezahlten, laufenden und kürzlich beendeten Buchungen, nicht bei stornierten.
- Nachträgliche Fotos werden als "Nachgereicht" gekennzeichnet, damit du sie im Admin-Bereich von den Pflichtfotos unterscheiden kannst. Kunden können sie nicht löschen.
- Der bisherige Ablauf mit Pflichtfotos vor Fahrtbeginn und bei Rückgabe bleibt unverändert.

Die Kundin mit Buchung EE2CE442 kann danach sofort Fotos nachreichen, sobald die neue Version veröffentlicht ist.

## Technische Details
- Neue Komponente `BookingPhotoUpload` in `src/routes/buchung.$bookingId.tsx`, zwei versteckte Datei-Eingaben (`accept="image/*" capture="environment"` bzw. `accept="image/*,.heic,.heif" multiple`), ausgelöst per Button-Klick (funktioniert in iOS Safari, Samsung Internet und Chrome).
- Verarbeitung nur über `normalizeImageFile` (src/lib/image-capture.ts) und Speichern nur über `saveTripPhoto` (src/lib/trip-photo-store.ts), Tag `additional`, seriell, mit Timeout; danach Neuladen der Fotoliste.
- Label `additional: "Nachgereicht"` in `PHOTO_TYPE_LABEL` und in den Admin-Labels; Texte in allen sieben Sprachen über src/lib/i18n.
- Test: Komponente zeigt beide Schaltflächen bei bezahlter Buchung, keine bei stornierter; Erfolg erst nach bestätigtem Speichern.
