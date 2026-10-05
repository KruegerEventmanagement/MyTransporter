// Android versionCode/versionName aus CI-Laufnummer (GitHub Actions).
// versionCode = OFFSET + run_number * 100 + run_attempt (1..99)
// OFFSET 1000 hält Abstand zu manuell/lokal hochgeladenen Builds (versionCode 1).
// Niemals Wiederholungen auf dieselbe Versionsnummer begrenzen.
export const VERSION_CODE_OFFSET = 1000;
export const MAX_VERSION_CODE = 2100000000;

export function computeAndroidVersion(env = process.env) {
  const runText = env.GITHUB_RUN_NUMBER ?? "";
  const attemptText = env.GITHUB_RUN_ATTEMPT ?? "1";
  const run = Number(runText);
  const attempt = Number(attemptText);
  if (!/^[1-9]\d*$/.test(runText) || !Number.isSafeInteger(run)) throw new Error("GITHUB_RUN_NUMBER fehlt/ungültig");
  if (!/^[1-9]\d*$/.test(attemptText) || !Number.isSafeInteger(attempt) || attempt > 99) {
    throw new Error("GITHUB_RUN_ATTEMPT muss zwischen 1 und 99 liegen; für weitere Versuche einen neuen Workflow-Lauf starten");
  }
  const code = VERSION_CODE_OFFSET + run * 100 + attempt;
  if (code <= 0 || code > MAX_VERSION_CODE) throw new Error(`versionCode ${code} außerhalb 1..${MAX_VERSION_CODE}`);
  const sha = (env.GITHUB_SHA ?? "").slice(0, 7);
  const name = `1.0.${run}${sha ? `-${sha}` : ""}`;
  return { versionCode: code, versionName: name };
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const v = computeAndroidVersion();
  // Ausgabe für $GITHUB_ENV
  console.log(`MT_VERSION_CODE=${v.versionCode}`);
  console.log(`MT_VERSION_NAME=${v.versionName}`);
}
