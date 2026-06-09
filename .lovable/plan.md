
## Ziel

Nach jedem Tacho-Foto (Pre-Drive & Return) erkennt die KI automatisch:
- **Kilometerstand** (z. B. 42850)
- **Tankstand** in Prozent (z. B. 75 %)

Der erkannte Wert wird ins jeweilige Eingabefeld geschrieben. Der Nutzer **sieht den Wert und kann ihn vor dem Bestätigen manuell korrigieren** (Sicherheit gegen Falscherkennung).

Beim Rückgabe-Foto vergleicht das System Start- vs. End-KM, berechnet Mehrkilometer automatisch und der Admin kann (wie bisher in `chargeBookingExtra`) die Karte off-session belasten.

## Standard-Entscheidungen (da übersprungen)

- **Umfang**: Tacho + Tankstand erkennen (ein Foto-Aufruf, eine KI-Antwort)
- **UX**: KI-Wert wird vorgeschlagen, Eingabefeld bleibt editierbar
- **Modell**: `google/gemini-2.5-flash` (multimodal, schnell, günstig — bewährt für solche Erkennungen)

## Architektur

```
Browser (PreDriveFlow / ReturnFlow)
   │ Foto hochgeladen → Storage-Pfad
   ▼
createServerFn: recognizeOdometer({ photoPath })
   │ signed URL erstellen
   │ Lovable AI Gateway: gemini-2.5-flash mit Bild + Prompt
   │ strukturierte Antwort: { km: number|null, fuelPercent: number|null, confidence: "low"|"med"|"high" }
   ▼
UI: Felder werden vorausgefüllt, "KI hat erkannt: 42.850 km / 75% – bitte prüfen"
```

## Änderungen im Code

### 1. Neue Server Function
**Datei**: `src/lib/odometer-ai.functions.ts`
- `recognizeOdometer({ photoPath, bookingId })`
- Auth-geschützt via `requireSupabaseAuth`
- Lädt Bild als Base64 oder signed URL aus `trip-photos` Bucket
- Ruft Lovable AI Gateway (Provider-Helper aus `ai-sdk-lovable-gateway`)
- Strukturierte Ausgabe via Zod-Schema: `{ km, fuelPercent, confidence, reasoning }`
- Speichert Erkennungswerte in neuer Spalte (siehe Migration unten) – auch wenn der Nutzer korrigiert, bleibt der KI-Originalwert nachvollziehbar.

### 2. AI Gateway Helper (falls noch nicht vorhanden)
**Datei**: `src/lib/ai-gateway.server.ts` – exportiert `createLovableAiGatewayProvider(LOVABLE_API_KEY)`.

### 3. PreDriveFlow.tsx
- Nach erfolgreichem Tacho-Foto-Upload: `recognizeOdometer` aufrufen
- Spinner/„KI analysiert..." anzeigen
- Bei Erfolg: `setStartKm(String(km))` + Hinweis-Banner „KI: 42.850 km erkannt – bitte prüfen"
- Bei Fehler/null: stillschweigend ignorieren, Nutzer tippt manuell

### 4. ReturnFlow.tsx
- Gleiche Logik nach `kind: "odometer"` für End-KM
- Tankstand: neues Feld unter dem Tacho-Foto („Tankstand bei Rückgabe: 75 %") + Korrekturmöglichkeit

### 5. Datenbank-Migration
Neue Spalten in `bookings`:
- `ai_start_km` int – KI-Originalerkennung Start
- `ai_end_km` int – KI-Originalerkennung Ende
- `ai_start_fuel_percent` int – Tank Start
- `ai_end_fuel_percent` int – Tank Ende

So bleibt nachvollziehbar, was die KI gesehen hat vs. was der Nutzer eingetragen hat (wichtig bei Streit über Mehrkilometer).

### 6. Admin-Sicht (`src/routes/admin.tsx`)
- In der Buchungs-Detailansicht beide Werte nebeneinander anzeigen: „KI: 42.920 km · Nutzer: 42.920 km" (grün wenn identisch, gelb bei Abweichung).
- Auch das Tacho-Foto direkt verlinken (vorhanden in `trip_photos`).

## Technisches

- Lovable AI Gateway ist bereits konfiguriert (`LOVABLE_API_KEY` ist gesetzt).
- Bild wird als signed URL übergeben (1 h gültig), Gemini lädt sie selbst.
- Strukturierte Ausgabe via AI SDK `Output.object` mit Zod-Schema – kein manuelles JSON-Parsing.
- Tankstand-Erkennung ist ungenauer als KM (analoge Anzeigen variieren stark). Bei `confidence: "low"` wird der Wert NICHT vorausgefüllt, nur als Hinweis angezeigt.
- Bei `429`/`402` vom Gateway: Toast „KI-Erkennung temporär nicht verfügbar – bitte manuell eintragen", Foto-Flow läuft normal weiter.
- Kosten: ~0,001 € pro Erkennung. Bei ~10 Buchungen/Tag = vernachlässigbar.

## Was NICHT in diesem Plan ist (separat besprechen)

- Automatisches Auslösen von `chargeBookingExtra` direkt nach Rückgabe (aktuell manuell durch Admin) – würde ich aus Sicherheitsgründen erst nach erfolgreichem Test der Erkennung machen.
- Schadens-Erkennung aus den 8 Außenfotos (deutlich aufwendiger, eigener Plan).
- Tankbeleg-OCR (Betrag/Liter) – wäre nice-to-have, jetzt nicht im Scope.

## Reihenfolge der Umsetzung

1. Migration für neue `ai_*` Spalten
2. AI Gateway Helper + Server Function
3. PreDriveFlow Integration + UI-Hinweis
4. ReturnFlow Integration + Tank-Feld
5. Admin-Ansicht: KI- vs. Nutzer-Werte anzeigen
6. Manueller Test mit echtem Tacho-Foto über Admin-Account
