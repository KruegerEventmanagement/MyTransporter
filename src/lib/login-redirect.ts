/**
 * Sicheres Rücksprungziel für den Login.
 *
 * Nur interne Pfade ("/…") werden akzeptiert, damit ein Link niemals
 * auf eine externe Domain umleiten kann.
 */

const TARGET_KEY = "mt_login_redirect";
const OPEN_KEY = "mt_open_login";

export function isSafeInternalPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("://") &&
    !path.includes("\\")
  );
}

/** Ziel merken, Login-Modal anfordern und zur Startseite navigieren. */
export function requireLogin(navigate: (opts: { to: string }) => void, target: string) {
  try {
    if (isSafeInternalPath(target)) sessionStorage.setItem(TARGET_KEY, target);
    sessionStorage.setItem(OPEN_KEY, "1");
  } catch {
    /* Storage kann blockiert sein – Login ist dann trotzdem erreichbar */
  }
  navigate({ to: "/" });
}

/** Soll das Login-Modal automatisch geöffnet werden? (einmalig) */
export function consumeLoginRequest(): boolean {
  try {
    const v = sessionStorage.getItem(OPEN_KEY);
    if (v) sessionStorage.removeItem(OPEN_KEY);
    return v === "1";
  } catch {
    return false;
  }
}

/** Gemerktes Ziel auslesen und löschen. */
export function takeLoginRedirect(): string | null {
  try {
    const v = sessionStorage.getItem(TARGET_KEY);
    if (v) sessionStorage.removeItem(TARGET_KEY);
    return isSafeInternalPath(v) ? v : null;
  } catch {
    return null;
  }
}
