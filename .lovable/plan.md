# Admin-Kalender mit manuellen Terminen

Ziel: Im Adminbereich ein Kalender-Tab, in dem du alle Belegungen siehst und selbst Termine (Offline-Vermietungen, Reservierungen, Werkstatt) eintragen kannst – mit Name, Telefon, E-Mail, Zeitraum von/bis inkl. Uhrzeit und Fahrzeug. Diese Termine blocken das Fahrzeug automatisch für Online-Buchungen und du bekommst dafür eine Erinnerung.

## Was du bekommst

**Neues Tab „Kalender" im Adminbereich**
- Monatsansicht mit Vor/Zurück-Navigation; pro Tag farblose (S/W) Marker für Belegungen.
- Tag antippen → Liste aller Belegungen dieses Tages: Online-Buchungen (bestehend, nur lesend) und manuelle Termine (bearbeitbar).
- Zusätzlich eine Listenansicht „nächste Termine".

**Manuellen Termin anlegen/bearbeiten/löschen**
Formular mit: Fahrzeug (Auswahl aus deinen Fahrzeugen), Startdatum + Startuhrzeit, Enddatum + Enduhrzeit, Name, Telefonnummer, E-Mail, freie Notiz, sowie Erinnerung an/aus. Validierung: Ende nach Start, Pflichtfelder, Kollisionswarnung wenn das Fahrzeug im Zeitraum bereits belegt ist (Buchung, Reservierung oder anderer manueller Termin).

**Automatisches Blocken**
Der manuelle Termin fließt in dieselbe Verfügbarkeitsprüfung wie Buchungen ein, d. h. das Fahrzeug ist im Buchungsformular für den Zeitraum nicht mehr wählbar.

**Erinnerung**
24 Stunden und 30 Minuten vor Terminbeginn: Eintrag in deine Admin-Benachrichtigungen (löst die bestehende Push-Benachrichtigung aufs Handy aus). Optional zusätzlich eine Erinnerungs-E-Mail an die im Termin hinterlegte Kundenadresse – als Häkchen im Formular, standardmäßig aus. Läuft über den bereits vorhandenen 15-Minuten-Zeitplan, kein neuer Dienst nötig.

## Technische Umsetzung

**Datenbank (eine Migration)**
Neue Tabelle `public.manual_reservations`: `vehicle_id`, `vehicle_plate`, `vehicle_name`, `start_at`, `end_at` (timestamptz), `customer_name`, `customer_phone`, `customer_email`, `note`, `reminder_enabled`, `notify_customer`, `reminder_24h_sent_at`, `reminder_30min_sent_at`, `created_by`, `created_at`, `updated_at` (+ `update_updated_at_column`-Trigger).
Grants: `authenticated` (SELECT/INSERT/UPDATE/DELETE) und `service_role` (ALL); **kein** `anon`-Grant. RLS an, alle Policies über `has_role(auth.uid(), 'admin')` – Kontaktdaten sind damit nie öffentlich lesbar. Die bestehende `vehicle_blocks`-Tabelle (öffentlich lesbar) bleibt unangetastet und bekommt bewusst keine Kontaktdaten.

**Server-Funktionen** in neuer Datei `src/lib/manual-reservations.functions.ts` mit `requireSupabaseAuth` + Admin-Rollenprüfung und Zod-Validierung: `listManualReservations` (Zeitraumfilter), `upsertManualReservation`, `deleteManualReservation`.

**Verfügbarkeit**: `getBusySlots` in `src/lib/availability.functions.ts` liest zusätzlich `manual_reservations` und gibt die Slots anonymisiert (nur Kennzeichen + Start/Ende) zurück – keine Kontaktdaten an den Client.

**Kalender-UI**: neue Komponente `src/components/admin/CalendarAdmin.tsx`, in `src/routes/admin.tsx` als weiteres Tab (`"calendar"`) eingehängt; Buchungsbelegungen aus dem vorhandenen Buchungs-State plus `computePlanReturn` aus `booking-rules.ts`. Design bleibt monochrom (Schwarz/Weiß/Grau, Fredoka).

**Erinnerungen**: `src/routes/api/public/hooks/send-reminders.ts` erhält einen zweiten Durchlauf für `manual_reservations` (Fenster 23–25 h bzw. 25–35 min vor `start_at`, Dedupe über die beiden `reminder_*_sent_at`-Spalten), schreibt `admin_notifications` (neue Typen `manual_reminder_24h` / `manual_reminder_30min`) und sendet die Kunden-E-Mail nur wenn `notify_customer` gesetzt ist.

Abschluss: Typecheck/Build und ein Smoke-Test (Termin anlegen → im Kalender sichtbar → Fahrzeug im Buchungsformular für den Zeitraum blockiert).
