# MyTransporter – Native App (iOS/Android) Build & Release

Stand: 05.10.2026. Kein Store-Upload aus Lovable. Keine Secrets im Repository.

## Architektur

- **Keine `server.url`-Wrapper-App.** `bun run build:native` baut mit `MT_NATIVE=1` den bestehenden TanStack-Start-Code als SPA-Shell (`tanstackStart.spa`) und kopiert ihn nach `dist-native/` (`_shell.html` → `index.html`). Capacitor bündelt diese Dateien lokal (`webDir: dist-native`).
- Der normale Web-Build (`vite build`) bleibt unverändert SSR auf dem Worker.
- Server-Funktionen (`/_serverFn/*`) und `/api/*` werden im Native-Build per `src/lib/native/remote-fetch.ts` an `https://www.mytransporter.org` geleitet (überschreibbar mit `VITE_MT_PUBLIC_ORIGIN`). Der Worker antwortet mit CORS nur für `capacitor://localhost`/`https://localhost` und nur auf diesen Pfaden, ohne Cookies (`src/lib/native/cors.ts`). Auth läuft wie im Web per Bearer-Token.
- Datenbank/Auth/Storage direkt über den bestehenden Backend-Client (RLS unverändert).
- **Voraussetzung:** Der Web-Stand mit der CORS-Änderung in `src/server.ts` muss veröffentlicht sein, bevor eine App-Version Server-Funktionen nutzen kann. Ältere App-Versionen bleiben nur kompatibel, solange Server-Funktionen rückwärtskompatibel bleiben.
- Stripe-Rückkehr und E-Mail-Bestätigung nutzen in der App immer `https://www.mytransporter.org/...` (`publicOrigin()`); über Universal/App Links öffnet sich wieder die App. Der Stripe-Webhook bleibt Source of Truth.

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

## GitHub Actions

`.github/workflows/native-ci.yml` (ohne Secrets): Tests, Native-Shell, Android-Debug-APK, unsignierter iOS-Simulator-Build.

## Offene Credentials / Blocker

- Apple Developer Team-ID, Zertifikate, Provisioning Profiles, APNs-Key
- Google Play Konto, Upload-Keystore, App-Signing-Fingerprint
- Firebase-Projekt (`google-services.json`, `GoogleService-Info.plist`) und Versand-Service-Account
- Serverseitiger nativer Push-Versand (bewusst noch nicht gebaut)
- 1024×1024-App-Icon-Original für Store-Qualität
- Veröffentlichung des Web-Stands mit CORS, bevor die App Server-Funktionen nutzt
- Keine physischen Gerätetests durchgeführt

## Validierung 05.10.2026 (Sandbox, Linux)

| Befehl | Exit |
|---|---|
| `bunx vitest run src/lib/native` (9 Tests) | 0 |
| `bunx vitest run` (41 Dateien, 491 Tests) | 0 |
| `tsgo -p .` | 0 |
| `npx vite build` (Web, SSR) | 0 |
| `node scripts/build-native.mjs` (dist-native) | 0 |
| `npx cap add android` / `npx cap add ios` / `npx cap sync` | 0 |
| `npx cap doctor` | 1 – Android ok, „Xcode is not installed“ |

Nicht möglich hier: Gradle-Build (kein JDK/Android SDK), `pod install`/Xcode (kein macOS), Gerätetests, Push-Empfang. Diese laufen im GitHub-Workflow bzw. Appflow.
