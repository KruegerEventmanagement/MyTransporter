# MyTransporter – Native App (iOS/Android) Build & Release

Stand: 05.10.2026, 21:32 UTC (23:30 Europe/Berlin). Kein Store-Upload aus Lovable. Keine Secrets im Repository.

## Architektur

- **Keine `server.url`-Wrapper-App.** `bun run build:native` baut mit `MT_NATIVE=1` den bestehenden TanStack-Start-Code als SPA-Shell (`tanstackStart.spa`) und kopiert ihn nach `dist-native/` (`_shell.html` → `index.html`). Capacitor bündelt diese Dateien lokal (`webDir: dist-native`).
- Der normale Web-Build (`vite build`) bleibt unverändert SSR auf dem Worker.
- Server-Funktionen (`/_serverFn/*`) und `/api/*` werden im Native-Build per `src/lib/native/remote-fetch.ts` an die kanonische `https://mytransporter.org` geleitet (www antwortet mit 307 und bricht den CORS-Preflight) (überschreibbar mit `VITE_MT_PUBLIC_ORIGIN`). Der Worker antwortet mit CORS nur für `capacitor://localhost`/`https://localhost` und nur auf diesen Pfaden, ohne Cookies (`src/lib/native/cors.ts`). Auth läuft wie im Web per Bearer-Token.
- Datenbank/Auth/Storage direkt über den bestehenden Backend-Client (RLS unverändert).
- **Voraussetzung:** Der Web-Stand mit der CORS-Änderung in `src/server.ts` muss veröffentlicht sein, bevor eine App-Version Server-Funktionen nutzen kann. Ältere App-Versionen bleiben nur kompatibel, solange Server-Funktionen rückwärtskompatibel bleiben.
- Stripe-Rückkehr und E-Mail-Bestätigung nutzen in der App immer `https://mytransporter.org/...` (`publicOrigin()`); über Universal/App Links öffnet sich wieder die App. Der Stripe-Webhook bleibt Source of Truth.

## Native Module

| Bereich | Umsetzung |
|---|---|
| App-ID / Name | `de.mytransporter.app` / MyTransporter (kein vorhandener Identifier gefunden) |
| Lifecycle | `src/lib/native/bootstrap.ts`: `resume` → `focus`+`visibilitychange`, Netzwerkwechsel → `online`/`offline` (Fahrtansicht, Rückgabeentwurf, Fotoqueue hören darauf) |
| StatusBar/Safe Area | Overlay + `viewport-fit=cover` (bestehende `env(safe-area-inset-*)`) |
| Splash/Icon | Splash via Plugin (weiß), Icons aus `public/icons/icon-512.png`. Für Google Play reicht das 512×512-Icon (Play-Format), sofern es den Qualitätscheck besteht; 1024×1024 nur für iOS später nötig |
| Deep Links | `src/lib/native/deep-links.ts` (Whitelist: `/trip/:id`, `/buchung/:id`, `/checkout/return`, `/auth/confirm`, öffentliche Seiten); Schema `mytransporter://` |
| Kamera/Fotos | Bestehende Browser-Aufnahme (getUserMedia/Datei-Input) läuft im WebView; Berechtigungstexte gesetzt. `@capacitor/camera` installiert für spätere native Auswahl |
| Push | Getrennte Tabelle `native_push_tokens` (RLS: nur eigene Zeilen), Registrierung nur per Nutzeraktion (`enableNativePush`). **Kein Versand implementiert** |
| Externe Links/Maps | `openExternal()` / `mapsDirectionsUrl()`; Standort nur im Vordergrund, kein Background-Location |
| Kontolöschung | Profil → „Konto löschen“ (`deleteMyAccount`): blockiert bei laufender/bevorstehender Miete; löscht Konto, Profil, Dokumente, Push-Registrierungen; Buchungen/Rechnungen bleiben (Aufbewahrungspflicht) |

## Befehle

```bash
bun install
bun run build:native      # dist-native
npx cap sync              # Web-Assets + Plugins in android/ und ios/
bun run cap:android       # Android Studio
bun run cap:ios           # Xcode (macOS, vorher: cd ios/App && pod install)
bun run android:debug     # Debug-APK (JDK 21 + Android SDK nötig)
npx cap doctor
```

## Universal Links / App Links

**Android (Stand 05.10.2026):** `public/.well-known/assetlinks.json` enthält `delegate_permission/common.handle_all_urls`, `android_app`, `de.mytransporter.app` und ausschließlich den SHA-256 der Google-Play-**App-Signatur** (`78:19:B9:…:81:E8`), keinen Upload- oder Debug-Key. Manifest: `autoVerify="true"` für `https://mytransporter.org` und `https://www.mytransporter.org`.
- `https://mytransporter.org/.well-known/assetlinks.json` liefert live HTTP 200 mit `application/json`; Googles Digital-Asset-Links-API liest für `https://mytransporter.org` genau diese Verknüpfung (geprüft 05.10.2026, 21:30 UTC).
- `www.mytransporter.org` antwortet mit 302-Weiterleitung auf die Root-Domain. Android folgt bei der Verifizierung keinen Weiterleitungen, daher wird www **nicht** verifiziert; www-Links öffnen ggf. den Browser, der dann auf die Root-Domain umleitet. Root-Links sind davon unabhängig. Für www-Verifizierung müsste www die Datei direkt mit 200 ausliefern (Hosting-Einstellung) – keine neue App-Version nötig.
- Ein lokaler Debug-Build (anderer Schlüssel) wird bewusst nicht verifiziert.

**iOS (später):** Vorlage in `native/well-known/`; benötigt `APPLE_TEAM_ID`.

## Android / Google Play

Stand 05.10.2026: Das Google-Play-Entwicklerkonto „Krueger Eventmanagement“ besteht bereits (vier Apps); die App `de.mytransporter.app` ist in der Play Console angelegt.

1. In der Play Console App `de.mytransporter.app` anlegen bzw. prüfen; Play App Signing aktivieren.
2. Upload-Keystore lokal erzeugen (`keytool -genkey -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`) – **nicht committen**.
3. GitHub-Secrets setzen: `ANDROID_KEYSTORE_BASE64` (base64 von upload.jks), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON`.
4. Version nicht manuell erhöhen: CI setzt `versionCode = 1000 + run_number*100 + run_attempt`, `versionName = 1.0.<run>-<sha7>`.
5. Erster Upload manuell: Artefakt `mytransporter-release-<versionCode>` (AAB) aus dem Workflow-Lauf laden und in „Interner Test“ hochladen; danach lädt jeder main-Push automatisch hoch (Track `internal`).
6. Datenschutz-Formular (Datensicherheit), Kontolöschungs-URL: `https://mytransporter.org/konto-loeschen`.
7. Push: Firebase-Projekt, `google-services.json` nach `android/app/` (gitignored), Versandweg serverseitig mit FCM-Service-Account als Secret.

## iOS / App Store (später, CI deaktiviert)

1. Apple Developer Program, App-ID `de.mytransporter.app` mit Capabilities **Associated Domains** und **Push Notifications**.
2. macOS: `cd ios/App && pod install`, `open App.xcworkspace`, Team setzen.
3. Entitlements: `ios/App/App/App.entitlements` (`aps-environment` für Release auf `production`).
4. Product → Archive → Distribute → App Store Connect → TestFlight.
5. App Store Connect: Datenschutzangaben, Kontolöschung in der App (vorhanden), Demo-Konto für Review bereitstellen.
6. Push: APNs-Key (.p8) erzeugen; Versand über FCM oder direkt APNs als Server-Secret.

## Ionic Appflow

1. Repo `KruegerEventmanagement/MyTransporter` verbinden.
2. Build-Befehl: Web-Build-Skript in Appflow auf `bun run build:native` setzen (Appflow nutzt `npm run build` → in den Appflow-Einstellungen „Custom web build command“ bzw. Umgebungsvariable `MT_NATIVE=1`).
3. Signing Credentials (iOS-Zertifikat + Provisioning Profile, Android-Keystore) in Appflow hochladen.
4. Native Builds: iOS „App Store“, Android „Release (aab)“; Deploy-Ziele App Store Connect / Play erst nach Prüfung.

## Android-CI & automatische Play-Updates (Stand 05.10.2026, 20:30 UTC)

Workflow `.github/workflows/android.yml` (iOS-CI deaktiviert, `ios/` bleibt im Repo; `native-ci.yml` entfernt).

- **check** (push `main` + PR): `bun install --frozen-lockfile` (kein Fallback), `bun run typecheck`, `bunx vitest run`, `bun run build:native`, `npx cap sync android`, `./gradlew assembleDebug lintDebug`, Artefakt `android-debug-apk` (+ Lint-Bericht).
- **release** (nur `push` auf `main` bzw. manuell im Repo `KruegerEventmanagement/MyTransporter`, erst nach grünem check): signiertes AAB (`bundleRelease`) + Upload per Play Developer API (`r0adkll/upload-google-play`).
  - Secrets (GitHub → Settings → Secrets → Actions): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON`. Fehlt eines, meldet der Job „NICHT eingerichtet“ (Warnung + Summary) und lädt nichts hoch. Keine Secret-Ausgabe.
  - Track: Variable `PLAY_TRACK` (Standard `internal`) bzw. Eingabe bei manuellem Start. `production` läuft über die GitHub-Umgebung `play-production` (dort Reviewer als Freigabe eintragen); sonst `play-internal`.
  - `PLAY_RELEASE_STATUS` (Standard `completed`). Solange die App in Play noch Entwurf ist, auf `draft` setzen.
  - **Erster Upload muss manuell** in der Play Console erfolgen (App anlegen, Play App Signing); erst danach akzeptiert die API Uploads.
- **Updates** kommen ausschließlich über Google Play. Kein `server.url`, kein Fremd-OTA.

### Version
`scripts/android-version.mjs`: `versionCode = 1000 + run_number*100 + run_attempt` (Versuch 1..99, strikt numerisch; ab 100 neuen Lauf starten). Signiertes AAB wird vor dem Upload als Artefakt `mytransporter-release-<versionCode>` (30 Tage) gesichert – für den manuellen Erstupload. Keystore mit `umask 077` geschrieben und per `trap` immer gelöscht. Die Umgebung `play-production` braucht separat eingerichtete Reviewer-Schutzregeln (Offset 1000; geprüft 1…2 100 000 000), `versionName = 1.0.<run_number>-<sha7>`. Gradle liest `MT_VERSION_CODE`/`MT_VERSION_NAME`; lokal `1`/`1.0-local` (nicht hochladen).

### Signierung
Nur über `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Unvollständig → `bundleRelease`/`assembleRelease` bricht mit klarer Meldung ab; nie Debug-Signierung. Unsigniertes Prüf-Bundle nur explizit: `./gradlew bundleRelease -PmtUnsignedRelease=true`.

### SDK
compile/targetSdk 36, minSdk 23, AGP 8.10.1, Gradle 8.11.1, Java 21.

### Berechtigungen
INTERNET, NETWORK_STATE, CAMERA, POST_NOTIFICATIONS, Vordergrund-Standort. `READ_MEDIA_IMAGES`/`READ_EXTERNAL_STORAGE` entfernt (Fotoauswahl über System-Picker). Kamera/GPS als `uses-feature required=false`.

### Build-Shell
`scripts/build-native.mjs` löscht vorher `.output`, `dist`, `dist-native.tmp`, erkennt `.output/public` (Nitro, z. B. GitHub-CI) oder `dist/client`, kopiert nur Client-Dateien (ohne `sw.js`, `server/`, Source-Maps), ersetzt `dist-native` atomar. Ursache des fehlgeschlagenen Laufs 37366862397: Script suchte nur `dist`.

### Server-Funktions-IDs
Compiler-Default `sha256(<projektrelativer Pfad>--<Name>)` ist bereits verzeichnisunabhängig; kein Override (IDs bleiben gleich wie live). Test vergleicht Web- und Native-Build-IDs.

### CORS
Preflight `OPTIONS` auf `/_serverFn/*`, `/api/*` → 204 nur für App-Origins; CORS-Header auch auf Fehlerantworten (4xx/5xx/catch).

### Native Start / Push
`bootstrap.ts`: jeder Schritt isoliert mit Timeout, Splash wird immer ausgeblendet, nur einmal initialisiert. Web-Push/Service Worker werden im nativen Build nicht registriert. **Nativer Push-Versand fehlt vollständig** (nur Token-Speicherung und Tipp-Navigation).

### Kontolöschung
Öffentlich ohne Login: `https://mytransporter.org/konto-loeschen` (für Play-Datensicherheitsformular).

## Validierung 05.10.2026, 20:30 UTC (Sandbox, Linux, ohne JDK/Android SDK)

| Befehl | Exit |
|---|---|
| `bunx vitest run src/lib/native` (19 Tests) | 0 |
| `bunx vitest run` (42 Dateien, 501 Tests) | 0 |
| `tsgo -p .` | 0 |
| `npx vite build` (Web) | 0 |
| `node scripts/build-native.mjs` (Quelle `dist/client`, kein `sw.js`) | 0 |
| ServerFn-ID-Vergleich zweites Build-Verzeichnis | identisch |
| `npx cap sync android` | 0 |
| Gradle `assembleDebug`/`lintDebug`/`bundleRelease` | **nicht lokal ausführbar** – läuft erst im GitHub-Workflow |

## Release-Stand Android (05.10.2026, 23:30 Europe/Berlin)

- Play Console: App `de.mytransporter.app` angelegt; **interner Test** mit 1.0.1 / versionCode **1002** am 05.10.2026 23:30 Europe/Berlin veröffentlicht. 1.0.0 / 1001 ist damit ersetzt. Kein offener oder Produktions-Release.
- **Store-Eintrag** (Deutsch) mit Icon, Featuregrafik und 2 Screenshots ist „Bereit für die Überprüfung“. Der App-Name ist noch temporär und nicht reviewt.
- **Testerliste** mit `info@mytransporter.org` und `superkruger5@gmail.com` ist nur vorbereitet, **nicht gespeichert** – die automatische Freigabeprüfung verlangt eine konkrete Zustimmung.
- **IARC-Nutzungsbedingungen** noch **nicht** akzeptiert; danach ist der Fragebogen offen.
- **Prüferzugang fehlt**; dadurch sind Zielgruppe und fertig ausgefüllte Datensicherheit (als Entwurf) noch blockiert.
- Kein Produktionszugang vor **12 Testern / 14 Tage** im geschlossenen Test.
- Achtung: die CI-Formel `1000 + run_number*100 + run_attempt` erzeugt deutlich höhere Codes als 1002 – nach einem CI-Upload sind manuelle Codes darunter nicht mehr möglich.
- GitHub-Actions-Run **37375920823** (Commit `3b673a0`): Job `check` erfolgreich (Typecheck, 501 Tests, Native-Build, `assembleDebug`, `lintDebug`); Job `release` hat Signierung + Upload wegen fehlender Secrets übersprungen. **Automatische Play-Updates sind somit NICHT aktiv** – 1002 wurde manuell hochgeladen.

## Offene Credentials / Blocker

- App angelegt; interner Release 1002 veröffentlicht (1001 ersetzt); 5 GitHub-Secrets fehlen → CI-Signierung/Upload inaktiv, automatische Play-Updates nicht aktiv
- Store-Eintrag: „Bereit für die Überprüfung“; App-Name temporär/unreviewed; IARC-Nutzungsbedingungen nicht akzeptiert, Fragebogen offen
- Prüferzugang fehlt; Zielgruppe + Datensicherheits-Entwurf dadurch blockiert; Testerliste vorbereitet, nicht gespeichert
- 12 Tester / 14 Tage vor Produktion
- Gradle-Lauf im CI bestätigt (Run 37375920823: assembleDebug + lintDebug grün)
- www-App-Link nicht verifizierbar, solange www per 302 umleitet
- Firebase (`google-services.json`) und serverseitiger FCM-Versand (nicht gebaut)
- 1024×1024-App-Icon nur für iOS (später); Android nutzt das 512er-Icon
- (erledigt) Web mit CORS und /konto-loeschen veröffentlicht; per curl verifiziert: OPTIONS 204 mit ACAO https://localhost, /konto-loeschen 200
- Apple/iOS: später (Team-ID, Zertifikate, APNs); iOS-CI deaktiviert
- Keine physischen Gerätetests
