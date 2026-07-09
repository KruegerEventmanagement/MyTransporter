# Drei Bugfixes: Startkilometer, Rückgabe-Bestätigung, Admin-Fotos

## 1. Startkilometer im aktiven Trip (echte Zahl statt 42.850)

**Problem:** `src/routes/trip.$bookingId.tsx` initialisiert `startKm` hart mit `42850` und lädt die Buchung nur einmal beim Mount. Nach dem PreDrive-Flow (der `bookings.start_km` schreibt) wird nicht neu geladen, also bleibt der Dummy-Wert im `ActiveTripDashboard` sichtbar.

**Fix:**
- `PreDriveFlow.onComplete` bekommt den eingegebenen `startKm` als Argument, ruft ihn in `trip.$bookingId.tsx` auf und setzt dort den State.
- Zusätzlich `startKm`-State initial `null` machen und im Rendering von `ActiveTripDashboard` einen Ladezustand zeigen, bis `booking.start_km` bzw. der frisch übergebene Wert vorliegt.
- Placeholder `42850` in `PreDriveFlow` entfernen (kein Auto-Prefill mehr — der Nutzer muss den echten Tacho-Wert eintragen; Kamera-Foto + KI-Erkennung dienen als Hilfe).
- Demo-Buchungspfad: `start_km` nicht mehr auf `42850` hardcoden, sondern aus `localStorage` lesen (nachdem PreDrive den Wert dort schreibt) bzw. `null` lassen.

## 2. Rückgabe muss vom Admin bestätigt werden

**Problem:** Am Ende von `ReturnFlow` (`returnStep === "code"`) kann der Nutzer per Klick auf „Warte auf Bestätigung..." selbst die Fahrt abschließen (`onComplete(returnCode)`), obwohl er den Schlüssel evtl. noch nicht abgegeben hat.

**Fix — Client (`ReturnFlow.tsx`):**
- Button „Warte auf Bestätigung..." wird ein rein informatives, disabled Element (kein Auto-Complete mehr).
- Beim Erreichen von `returnStep === "code"` startet ein Realtime-/Polling-Listener auf `bookings.status`. Sobald `status === "completed"`, wird `onComplete(returnCode)` automatisch ausgelöst und die Bestätigungs-Ansicht (Schlüsselübergabe quittiert) angezeigt.
- Ergänzender Text: „Der Admin bestätigt die Schlüsselübergabe. Erst danach ist die Fahrt beendet."

**Fix — Admin (`src/routes/admin.tsx`):**
- In der Buchungs-Kachel bei `status === "returning"` einen prominenten Button „Schlüssel erhalten & Fahrt abschließen" mit Rückgabe-Code-Anzeige rendern.
- Klick setzt `bookings.status = "completed"` (und `completed_at = now()`), plus lokale Aktualisierung.
- Bestätigungs-Dialog („Ich bestätige den Erhalt des Schlüssels für Fahrzeug X"), um Fehlklicks zu vermeiden.

**Fix — Push-Benachrichtigung:**
- `handleFinish` in `ReturnFlow` ruft zusätzlich zur `notifyAdmin(...)` (In-App) den bestehenden Push-Endpoint auf, sodass der Admin (kroeger.christian96@gmx.de) auch außerhalb der App eine Push-Benachrichtigung mit Rückgabecode bekommt. Vorhandene `push.functions.ts`/VAPID-Infrastruktur wird genutzt; kein neuer Endpoint nötig.

## 3. Fotos werden im Admin nicht angezeigt (404)

**Problem:** Der `trip-photos`-Bucket ist privat. In `admin.tsx` wird `ph.photo_url` (nur der Storage-Pfad) direkt als `<img src>` gesetzt → 404. Bei `user-documents` wird bereits korrekt mit `createSignedUrl` gearbeitet.

**Fix (`admin.tsx`):**
- Analog zu `user-documents` alle geladenen `trip_photos` beim Fetch in Signed URLs auflösen (via `resolveTripPhotoUrl` aus `src/lib/trip-photos.ts`), in einem `photoUrls: Record<string, string>`-State cachen.
- `PhotoGroup` erhält die aufgelöste URL statt `ph.photo_url`. Betrifft alle drei Gruppen: „Fahrzeug vor der Fahrt", „Fahrzeug nach der Fahrt" und „Tankbeleg".
- Legacy-Rows mit vollständiger URL (`https://...`) funktionieren weiterhin, weil `resolveTripPhotoUrl` sie unverändert zurückgibt.

## Betroffene Dateien

- `src/routes/trip.$bookingId.tsx` — Start-KM State-Handling, `onComplete`-Signatur.
- `src/components/PreDriveFlow.tsx` — `onComplete(startKm)`, Placeholder-Cleanup.
- `src/components/ReturnFlow.tsx` — Wartestatus + Realtime-Listener auf `bookings.status`, Push-Trigger.
- `src/routes/admin.tsx` — Bestätigungs-Button für Rückgabe, Signed URLs für `trip_photos`.
- Ggf. kleine Ergänzung in `src/lib/push.functions.ts`/`push-client.ts`, falls Trigger für „trip_returning" noch fehlt.

Keine Schema-Änderungen nötig (`status`, `return_code`, `completed_at` existieren bereits).
