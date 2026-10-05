# MyTransporter – Native App (iOS/Android) Build & Release

Stand: 05.10.2026. Kein Store-Upload aus Lovable. Keine Secrets im Repository.

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
| Splash/Icon | Splash via Plugin (weiß), Icons aus `public/icons/icon-512.png` erzeugt. Für Store-Qualität ein 1024×1024-Original liefern und `npx @capacitor/assets generate` ausführen |
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

## Universal Links / App Links (offen – Werte fehlen)

Vorlagen in `native/well-known/`. Nach Erhalt der Werte als
`public/.well-known/apple-app-site-association` (ohne Endung, `application/json`) und
`public/.well-known/assetlinks.json` ablegen und Web veröffentlichen.
- `APPLE_TEAM_ID` aus dem Apple Developer Account.
- `PLAY_APP_SIGNING_SHA256_FINGERPRINT` aus Play Console → App-Integrität → App-Signatur.

## Android / Google Play

1. Play-Console-Konto, App `de.mytransporter.app` anlegen.
2. Upload-Keystore lokal erzeugen (`keytool -genkey -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`) – **nicht committen**.
3. Signierung in Android Studio (Build → Generate Signed Bundle) oder Appflow (Signing Credentials hochladen).
4. `versionCode`/`versionName` in `android/app/build.gradle` erhöhen.
5. `./gradlew bundleRelease` → `.aab` in Internen Test hochladen.
6. Datenschutz-Formular (Datensicherheit), Kontolöschungs-URL angeben (`https://www.mytransporter.org/profil#konto-loeschen` bzw. Kontakt info@mytransporter.org).
7. Push: Firebase-Projekt, `google-services.json` nach `android/app/` (gitignored), Versandweg serverseitig mit FCM-Service-Account als Secret.

## iOS / App Store

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
`scripts/android-version.mjs`: `versionCode = 1000 + run_number·10 + min(run_attempt, 9)` (Offset 1000; geprüft 1…2 100 000 000), `versionName = 1.0.<run_number>-<sha7>`. Gradle liest `MT_VERSION_CODE`/`MT_VERSION_NAME`; lokal `1`/`1.0-local` (nicht hochladen).

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

## Offene Credentials / Blocker

- Play-Console-Konto, App anlegen, erster manueller Upload, Upload-Keystore + 5 GitHub-Secrets
- `PLAY_APP_SIGNING_SHA256_FINGERPRINT` für `assetlinks.json`
- Firebase (`google-services.json`) und serverseitiger FCM-Versand (nicht gebaut)
- 1024×1024-App-Icon-Original
- Web-Veröffentlichung (CORS + stabile ServerFn-IDs), bevor die App Server-Funktionen nutzt
- Apple/iOS: später (Team-ID, Zertifikate, APNs); iOS-CI deaktiviert
- Keine physischen Gerätetests
