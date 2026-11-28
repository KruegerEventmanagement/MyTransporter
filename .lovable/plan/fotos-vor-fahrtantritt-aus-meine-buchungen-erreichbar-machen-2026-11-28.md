# Fotos vor Fahrtantritt aus „Meine Buchungen“ erreichbar machen

## Ursache (im Code bestätigt)
Im Profil zeigt die Buchungskarte für bezahlte, noch nicht gestartete Buchungen nur „Fahrt stornieren“. Der Knopf zur Fahrtseite („Zur Fahrt“) erscheint erst, wenn die Fahrt bereits läuft. Die Fotos vor Fahrtantritt werden aber genau auf dieser Fahrtseite aufgenommen. Die Kundin hatte also im Profil keinen Weg dorthin. Tippen auf den Fahrzeugnamen öffnet nur die Buchungsdetails, wo man Fotos ansehen, aber nicht vor der Fahrt aufnehmen kann.

## Änderung
- Auf jeder bezahlten, noch nicht gestarteten Buchungskarte (anstehende Fahrt und „Alle Fahrten“) kommt ein schwarzer Knopf **„Fahrt starten & Fotos hochladen“**. Er führt zur Fahrtseite dieser Buchung.
- Liegt der Start mehr als 30 Minuten in der Zukunft, zeigt die Fahrtseite wie bisher die Wartezeit bis zur Freischaltung. Ab 30 Minuten vorher erscheinen direkt Fotos und Kilometerstand.
- Der Knopf erscheint nicht bei stornierten, abgeschlossenen oder alten verfallenen Buchungen und nicht, wenn das Mietende schon vorbei ist.
- „Fahrt stornieren“ bleibt darunter unverändert.
- Der Knopftext wird in alle sieben Sprachen übersetzt.

## Prüfung
- Kleiner Test für die Regel, wann der Knopf erscheint.
- Im Browser als Kundin mit Handygröße: Profil öffnen, Knopf antippen, Fotoschritt erscheint.

## Technische Details
- `src/routes/profil.tsx` `BookingRow`: neue Bedingung `b.status === "paid" && b.start_km === null && !isLegacyOpenTrip(b) && bookingEnd(b) > now` → `<Link to="/trip/$bookingId">`.
- Regel als kleine reine Funktion in `src/lib/active-trip.ts` (z. B. `canStartPreDrive`), mit Test daneben.
- Übersetzung über `src/lib/i18n` (MESSAGES/Katalog), keine Logikänderung an Fotos, Upload oder Fahrtseite.
