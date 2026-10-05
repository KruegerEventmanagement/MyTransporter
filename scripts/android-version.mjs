// Android versionCode/versionName aus CI-Laufnummer (GitHub Actions).
// versionCode = OFFSET + run_number * 10 + min(run_attempt, 9)
// OFFSET 1000 hält Abstand zu manuell/lokal hochgeladenen Builds (versionCode 1).
// Monoton: run_number steigt je Workflow; Wiederholungen (run_attempt) bleiben innerhalb der 10er-Stufe.
export const VERSION_CODE_OFFSET = 1000;
export const MAX_VERSION_CODE = 2100000000;

export function computeAndroidVersion(env = process.env) {
  const run = Number.parseInt(env.GITHUB_RUN_NUMBER ?? "", 10);
  const attempt = Number.parseInt(env.GITHUB_RUN_ATTEMPT ?? "1", 10);
  if (!Number.isInteger(run) || run <= 0) throw new Error("GITHUB_RUN_NUMBER fehlt/ungültig");
  if (!Number.isInteger(attempt) || attempt <= 0) throw new Error("GITHUB_RUN_ATTEMPT ungültig");
  const code = VERSION_CODE_OFFSET + run * 10 + Math.min(attempt, 9);
  if (code <= 0 || code > MAX_VERSION_CODE) throw new Error(`versionCode ${code} außerhalb 1..${MAX_VERSION_CODE}`);
  const sha = (env.GITHUB_SHA ?? "").slice(0, 7);
  const name = `1.0.${run}${sha ? `-${sha}` : ""}`;
  return { versionCode: code, versionName: name };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const v = computeAndroidVersion();
  // Ausgabe für $GITHUB_ENV
  console.log(`MT_VERSION_CODE=${v.versionCode}`);
  console.log(`MT_VERSION_NAME=${v.versionName}`);
}
