## Manuelle Buchung: Kitchen Hero Ali Kasim

- Fahrzeug: Citroen Jumper L1H1, PF MY 1003
- Zeitraum: So 01.11.2026 18:00 bis Mo 02.11.2026 18:00 (deutsche Zeit)
- Geprüft: Für diesen Zeitraum gibt es keine Buchung, Reservierung oder Sperre. Die Buchung heute (31.10., 12:00, 3 Std.) überschneidet sich nicht.

### Was passiert
- Ich trage einen manuellen Termin im Admin-Kalender ein, Kunde „Kitchen Hero Ali Kasim“.
- Dadurch kann das Fahrzeug in diesem Zeitraum online nicht mehr gebucht werden. Die Datenbank verhindert Doppelbuchungen automatisch.
- Kundenbenachrichtigung und Kundenerinnerung bleiben aus, es gibt keine Zahlung. Telefon, E-Mail und Preis bleiben leer, solange Sie sie mir nicht nennen.
- Die normale Betreiber-Mail an info@mytransporter.org und der Kalendereintrag laufen automatisch wie bei jedem manuellen Termin.

### Technisch
- Ein Eintrag in manual_reservations (vehicle_id b84d0d58…, start_at 2026-11-01 17:00 UTC, end_at 2026-11-02 17:00 UTC, notify_customer=false, reminder_enabled=false). Danach prüfe ich, dass die Verfügbarkeitsprüfung das Fahrzeug als belegt meldet.
