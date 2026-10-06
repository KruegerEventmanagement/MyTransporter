# MyTransporter – Native App (iOS/Android) Build & Release

Stand: 06.10.2026; interner Release um 19:30 Europe/Berlin bestätigt. Kein Store-Upload aus Lovable. Keine Secrets im Repository.

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
3. Die vier Signierungs-Secrets sind eingerichtet: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. `PLAY_SERVICE_ACCOUNT_JSON` wird zusätzlich für automatische Uploads benötigt und fehlt derzeit.
4. Version nicht manuell erhöhen: CI setzt `versionCode = 1000 + run_number*100 + run_attempt`, `versionName = 1.0.<run>-<sha7>`.
5. Manueller Upload: Artefakt `mytransporter-release-<versionCode>` (AAB) aus dem Workflow-Lauf laden und in „Interner Test“ hochladen. Automatische Uploads nach main-Push sind erst mit eingerichtetem `PLAY_SERVICE_ACCOUNT_JSON` möglich (Standard-Track `internal`).
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

## Android-CI & automatische Play-Updates (Stand 06.10.2026)

Workflow `.github/workflows/android.yml` (iOS-CI deaktiviert, `ios/` bleibt im Repo; `native-ci.yml` entfernt).

- **check** (push `main` + PR): `bun install --frozen-lockfile` (kein Fallback), `bun run typecheck`, `bunx vitest run`, `bun run build:native`, `npx cap sync android`, `./gradlew assembleDebug lintDebug`, Artefakt `android-debug-apk` (+ Lint-Bericht).
- **release** (nur `push` auf `main` bzw. manuell im Repo `KruegerEventmanagement/MyTransporter`, erst nach grünem check): signiertes AAB (`bundleRelease`) + Upload per Play Developer API (`r0adkll/upload-google-play`).
  - Secrets (GitHub → Settings → Secrets → Actions): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON`. Die vier `ANDROID_*`-Secrets steuern die Signierung. Fehlt eines davon, wird kein Release gebaut. `PLAY_SERVICE_ACCOUNT_JSON` steuert ausschließlich den automatischen Upload: Fehlt es, wird das signierte AAB trotzdem als Artefakt für den manuellen Upload erstellt. Keine Secret-Ausgabe.
  - Track: Variable `PLAY_TRACK` (Standard `internal`) bzw. Eingabe bei manuellem Start. `production` läuft über die GitHub-Umgebung `play-production` (dort Reviewer als Freigabe eintragen); sonst `play-internal`.
  - `PLAY_RELEASE_STATUS` (Standard `completed`). Solange die App in Play noch Entwurf ist, auf `draft` setzen.
  - **Erster Upload muss manuell** in der Play Console erfolgen (App anlegen, Play App Signing); erst danach akzeptiert die API Uploads.
- **Updates** kommen ausschließlich über Google Play. Kein `server.url`, kein Fremd-OTA.

### Version
`scripts/android-version.mjs`: `versionCode = 1000 + run_number*100 + run_attempt` (Versuch 1..99, strikt numerisch; ab 100 neuen Lauf starten). Signiertes AAB wird vor dem Upload als Artefakt `mytransporter-release-<versionCode>` (30 Tage) gesichert – für den manuellen Erstupload. Keystore mit `umask 077` geschrieben und per `trap` immer gelöscht. Die Umgebung `play-production` braucht separat eingerichtete Reviewer-Schutzregeln (Offset 1000; geprüft 1…2 100 000 000), `versionName = 1.0.<run_number>-<sha7>`. Gradle liest `MT_VERSION_CODE`/`MT_VERSION_NAME`; lokal `1`/`1.0-local` (nicht hochladen).

### Signierung
Nur über `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Unvollständig → `bundleRelease`/`assembleRelease` bricht mit klarer Meldung ab; nie Debug-Signierung. Unsigniertes Prüf-Bundle nur explizit: `./gradlew bundleRelease -PmtUnsignedRelease=true`.

### SDK
compile/targetSdk 36, minSdk 24 (Android 7.0+), AGP 8.10.1, Gradle 8.11.1, Java 21. Die Play Console lehnte das Bundle mit minSdk 23 bei aktiviertem automatischem Schutz ab. minSdk 24 behebt diesen Upload-Blocker; der Schutz bleibt aktiviert. Android-6-Geräte werden damit nicht mehr unterstützt.

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

## Verifizierter Release-Stand Android (06.10.2026)

- **Interner Test veröffentlicht:** versionCode **3601**, versionName **1.0.26-19733fc**, Release-Name „1.0.26 - Interner Funktionstest“. Die Play Console bestätigt „Für interne Tester verfügbar“, veröffentlicht am 06.10.2026 um 19:30 Europe/Berlin. Status „Nicht überprüft“; keine öffentliche Produktionsfreigabe.
- Installations-/Opt-in-Link für freigeschaltete interne Testkonten: https://play.google.com/apps/internaltest/4701236058930531396
- Beide vorhandenen internen Testerlisten „MyTransporter – Inhaber“ (2 Adressen) und „MyTransporter – Inhaber GMX“ (1 Adresse) sind gespeichert und aktiviert. Keine neuen Personen eingeladen.
- **Geschlossener Test Alpha vorbereitet:** derselbe Build 3601, Release-Name „1.0.26 - Geschlossener Test“, Zielland Deutschland. Release und Land sind gespeichert, aber noch nicht zur Überprüfung eingereicht. Eine Liste echter geschlossener Testpersonen fehlt.
- Die Veröffentlichungsübersicht zeigt 10 noch nicht eingereichte Änderungen, darunter den deutschen Store-Eintrag und den Fragebogen zur Inhaltseinstufung. Die frühere Angabe zum noch offenen IARC-Fragebogen ist damit überholt.
- Google nennt **Zielgruppe/Inhalte** und **Datensicherheit** als Einreichungsblocker. Die Zielgruppe ist durch fehlende App-Anmeldedaten blockiert; das vollständig ausgefüllte Datensicherheitsformular lässt sich erst nach Angabe der Zielgruppe abschließend speichern. Der vorhandene Datenschutz-Entwurf wurde geprüft und beibehalten.
- **Prüferzugang erforderlich:** dauerhaft erreichbares, bestätigtes Kunden-Testkonto mit Zugang zu den eingeschränkten App-Funktionen und passenden Prüfanweisungen. Kein persönlicher Administratorzugang. Zugangsdaten direkt in der Play Console hinterlegen, nie im Repository.
- Für betroffene neue private Entwicklerkonten verlangt Google mindestens **12 Testpersonen**, die mindestens **14 Tage fortlaufend** am geschlossenen Test teilnehmen. Danach Produktionszugriff beantragen. Eigene zusätzliche E-Mail-Adressen ersetzen keine unabhängigen Testpersonen; der interne Test zählt für diese Frist nicht. Die Frist hat mit dem hier vorbereiteten, noch nicht veröffentlichten Alpha-Release noch nicht begonnen.
- Offizielle Vorgaben: https://support.google.com/googleplay/android-developer/answer/14151465?hl=de

### Build-Nachweis

- Workflow-Korrektur auf main: Commit `185d0171e6964006dbee379696f31b90e57b9c27` trennt Signierung vom optionalen automatischen Play-Upload.
- minSdk-Korrektur auf main: Commit `19733fc8396afd064f5b84c386d328d32cadf165`.
- Erfolgreicher GitHub-Actions-Lauf: https://github.com/KruegerEventmanagement/MyTransporter/actions/runs/37502309840
- Typecheck, Tests, Native-Build, Capacitor-Sync, `assembleDebug`, `lintDebug` und signiertes `bundleRelease` erfolgreich. Automatischer Play-Upload wegen fehlendem `PLAY_SERVICE_ACCOUNT_JSON` übersprungen; der manuelle Upload von 3601 wurde anschließend erfolgreich veröffentlicht.
- Artefakt `mytransporter-release-3601` (ID 11430761818); ZIP-SHA-256 beim Download verifiziert: `18f4ab5e8feeafff468db9e2b5d6504cd7b55322c3eedf22cf7c304b6a2184da`.
- Kein physischer Android-Gerätetest und kein vollständiger Buchungs-/Zahlungsablauf durch diesen Durchlauf bestätigt.

## Weitere offene technische Punkte

- `PLAY_SERVICE_ACCOUNT_JSON` fehlt; automatische Play-Uploads sind weiterhin inaktiv. Signierte AABs werden erfolgreich gebaut.
- www-App-Link nicht verifizierbar, solange www per 302 umleitet (zuletzt 05.10.2026 geprüft).
- Firebase-Konfiguration und serverseitiger FCM-Versand fehlen; nativen Push nicht als fertig ausgeliefert betrachten.
- Web mit CORS und /konto-loeschen war am 05.10.2026 live verifiziert: OPTIONS 204 mit ACAO https://localhost, /konto-loeschen 200.
- Apple/iOS bleibt separat: Team-ID, Zertifikate, APNs und 1024×1024-Icon; iOS-CI deaktiviert.
