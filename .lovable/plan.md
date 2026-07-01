# Echte KI-Prüfung für Ausweis & Führerschein

Der bestehende Scanner ist eine Fake-Animation (zufälliger Fortschrittsbalken, keine Prüfung). Er wird durch eine echte KI-Vision-Prüfung ersetzt, plus höhere Bildqualität und Namensabgleich.

## 1. Kamera & Bildqualität (`src/components/DocumentScanner.tsx`)
- getUserMedia: `width: { ideal: 1920 }`, `height: { ideal: 1080 }`, `advanced: [{ focusMode: "continuous" }, { focusDistance: 0.1 }]` (mit Fallback), `frameRate: { ideal: 30 }`.
- Capture: 3-Sekunden-Countdown (Nutzer:in soll ruhig halten), Foto in voller `videoWidth`/`videoHeight`, JPEG-Qualität `0.95`.
- Kurze Schärfe-Heuristik vor dem Auslösen: einfacher Laplacian-Varianz-Check auf einem 200×200-Ausschnitt in der Mitte via Canvas — wenn zu unscharf, Hinweis „Bild zu unscharf, bitte ruhig halten" und Nutzer:in muss erneut auslösen. Kein Auto-Submit unscharfer Bilder.
- Torch-Toggle-Button (wenn `track.getCapabilities().torch`), damit Ausweise auch bei schlechtem Licht lesbar sind.

## 2. Neue Server-Function `verifyIdDocument` (`src/lib/id-verify.functions.ts`)
- `createServerFn({ method: "POST" })`, mit `requireSupabaseAuth`.
- Input: `{ imageBase64, docType: "license"|"id", side: "front"|"back" }`.
- Lädt Profil (`first_name`, `last_name`) über den authenticated Supabase-Client.
- Ruft Lovable AI Gateway (`google/gemini-2.5-flash`) über die bestehende `ai-gateway.server.ts`-Helper auf, `structuredOutputs`-freundliches JSON via Prompt + `response_format: json_object`. Prompt (deutsch) verlangt Rückgabe:
  ```json
  {
    "documentClass": "german_id_card" | "german_drivers_license" | "eu_id_card" | "eu_drivers_license" | "other",
    "side": "front" | "back" | "unknown",
    "readable": boolean,
    "blurry": boolean,
    "firstName": string|null,
    "lastName": string|null,
    "documentNumber": string|null,
    "expiryDate": string|null,
    "securityFeaturesVisible": boolean,
    "looksAuthentic": boolean,
    "rejectionReason": string|null
  }
  ```
- Server-seitige Validierung:
  - `documentClass` muss zum gewählten `docType` passen (ID → id_card, license → drivers_license). Sonst `reason: "wrong_document_type"`.
  - `side` muss zum verlangten `side` passen. Sonst `reason: "wrong_side"`.
  - `blurry === true` oder `readable === false` → `reason: "blurry"`.
  - `looksAuthentic === false` → `reason: "not_authentic"`.
  - Nur bei `side === "front"`: Name-Abgleich. Normalisierung (lowercase, Diakritika entfernen, Bindestriche/Leerzeichen tolerant). Beide Namensteile müssen im extrahierten Namen vorkommen (jeder Vorname zählt), sonst `reason: "name_mismatch"` inkl. `extractedName` in der Response, damit die UI erklären kann warum.
  - Rückgabe: `{ ok: boolean, reason: string|null, extracted: {...} }`.
- Kein Storage-Schreibzugriff hier — nur Prüfen. Bild wird als base64 übergeben (bereits vom Client aufgenommen), nicht persistent gespeichert bevor OK.

## 3. Client-Flow (DocumentScanner)
- Nach Capture: erst `verifyIdDocument({ data: { imageBase64, docType, side } })`.
- Nur bei `ok: true` das Foto in Storage hochladen und `user_documents` einfügen (bisheriger Upload-Code), plus neue Spalten (siehe 4.).
- Bei Fehler: verständliche deutsche Meldung je `reason`:
  - `wrong_document_type` → „Das erkannte Dokument passt nicht. Bitte {Führerschein|Personalausweis} halten."
  - `wrong_side` → „Bitte {Vorder|Rück}seite fotografieren."
  - `blurry` → „Bild ist unscharf. Bitte ruhig halten, gute Beleuchtung."
  - `not_authentic` → „Sicherheitsmerkmale nicht erkennbar. Bitte Original vor neutralem Hintergrund fotografieren."
  - `name_mismatch` → „Name auf Dokument (‚{extractedName}') stimmt nicht mit deinem Profil (‚{profileName}') überein."
- Fake-Progress-Bar entfernen. Ersetzen durch echte Zustände: „Bild aufnehmen → Hochladen → KI prüft Dokument → KI prüft Name → Fertig", jeder Schritt echt (Promise-Zustände), kein `Math.random`.
- Retry-Button nach jedem Fehler; Fortschritt für die andere Seite bleibt erhalten.

## 4. Datenbank (Migration)
- Neue Spalten auf `user_documents`:
  - `ai_verified boolean not null default false`
  - `ai_document_class text`
  - `ai_extracted_name text`
  - `ai_reason text`
  - `verified_at timestamptz`
- Kein RLS-Umbau, bestehende Policies decken es.

## 5. Bewusst nicht enthalten
- Keine Live-OCR im Videostream (Performance, Battery). Prüfung erfolgt beim Auslösen.
- Keine biometrische Gesichtserkennung — nur Namens- und Dokumentklassenabgleich.

## Technisch
- `src/lib/id-verify.functions.ts`: neue Datei, ~120 Zeilen, nutzt `createLovableAiGatewayProvider` aus `src/lib/ai-gateway.server.ts` und `generateText` mit `response_format: json_object`.
- `src/components/DocumentScanner.tsx`: Rewrite der Kamera- und Progress-Logik; Struktur (Idle/Camera/Verified/Error) bleibt.
- Migration in `supabase/migrations/`.
- Kein Eingriff in `BookingSection.tsx` / `profil.tsx` — die nutzen `DocumentScanner` unverändert und `onComplete` wird erst nach erfolgreicher KI-Prüfung ausgelöst, wodurch die 4-Teile-Verifizierungslogik in `BookingSection` (`verified`-Check) automatisch korrekt greift.