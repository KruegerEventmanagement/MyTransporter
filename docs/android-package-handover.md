# Android package handover — preparation only

Date: 23 October 2026. Android package: `de.mytransporterr.app`. Displayed brand: MyTransporter. iOS bundle identifier remains `de.mytransporter.app`.

## Verified evidence

- Baseline commit: `6aa6317d07259782b3a501e99d17b359566eaa63`.
- Code checkpoint after migration: `abcd223b352b9407461642e303bf5b48d4b1e67f` (documentation updates may follow; no manual commit/push performed).
- `bunx vitest run src/lib/native`: **25 tests passed**, three files, exit 0, 23 October at 14:58 UTC. Includes five new tests for package identity, iOS preservation, mixed-platform rejection, Android consistency, and explicit Play-upload gating.
- Actual installed Capacitor CLI `loadConfig()` validated with `sync android`: `de.mytransporterr.app`; `sync ios`: `de.mytransporter.app`; platformless `sync` rejected. Exit 0.
- Lovable automatic preview build log: **build OK** at 14:56:59, 14:57:35 and 14:58:01 UTC. No independently executed full typecheck or native production build; no claim that this is Android/Gradle build evidence.
- Firebase Android configuration file absent. Signing secret contents not read or changed.

## Exact migration files

- `.github/workflows/android.yml` — new default-false `workflow_dispatch.upload_to_play`, double upload gate, new Play package name; sign-only artifact retained.
- `android/app/build.gradle` — applicationId and namespace.
- `android/app/src/main/java/de/mytransporter/app/MainActivity.java` → `android/app/src/main/java/de/mytransporterr/app/MainActivity.java` — moved and package declaration changed; manifest `.MainActivity` resolves against new namespace.
- `android/app/src/main/res/values/strings.xml` — Android package/custom scheme resources; displayed names unchanged. Manifest's functional `mytransporter://` scheme retained.
- `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` — installed-package assertion.
- `capacitor.config.ts`, new `scripts/capacitor-identity.ts` — explicit platform identity selection.
- `package.json` — sync both platforms separately instead of one mixed-platform sync.
- `native/well-known/assetlinks.template.json` — new Android package, signing-certificate placeholder retained.
- New `src/lib/native/package-identity.test.ts` — migration safety regression tests.
- `AGENTS.md`, `android/AGENTS.md` — platform identity and sign-only/explicit upload rules.
- `docs/native-store-release.md`, this file and `roadmap.md` — handover, evidence, release blockers.

## CI and release blockers

**No new APK/AAB built, no artifact link, no Play upload, no website/backend deployment.** There is no accessible GitHub connection or GH_TOKEN/GITHUB_TOKEN in this session. GitHub-hosted signing secret availability is unverified. Run `.github/workflows/android.yml` on the reviewed `main` revision with `upload_to_play=false`; check job performs typecheck, tests, native shell, Capacitor sync, debug assembly/lint; release signs and retains `mytransporter-release-<versionCode>` for 30 days when all signing secrets exist. Never enable the upload flag under this preparation authorization.

GitHub access can be provided here: https://lovable.dev/connectors/github/connect?workspace=i3iIdvfG4hOUHq2Dme4e

The publishing team reports old package rejected/new package accepted, but **rejection reason and current Play listing status remain unverified**. The new package is a separate app identity, not an update for old installations. Team must confirm listing and appropriate existing upload-key enrollment before release; signing keys were not modified.

`public/.well-known/assetlinks.json` remains unchanged to preserve the current app/website association. Verify the new Play App Signing certificate and separately authorize an association-file deployment before claiming new-package verified App Links. Do not blindly copy the old package's certificate. Firebase registration/configuration must also match the new Android package before native push can be claimed functional. No device installation or signed-package inspection was performed.

No database changes, payments, emails, or unrelated tasks were performed.