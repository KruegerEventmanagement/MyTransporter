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
    /* ignoriert */
  }
  try {
    // Mail-Browser verlieren sessionStorage oft beim Tab-Wechsel; kurz zusätzlich lokal merken.
    if (isSafeInternalPath(target)) localStorage.setItem(TARGET_KEY, JSON.stringify({ t: target, at: Date.now() }));
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
export const LOCAL_TARGET_TTL_MS = 30 * 60 * 1000;

function takeLocalTarget(now: number): string | null {
  try {
    const raw = localStorage.getItem(TARGET_KEY);
    if (!raw) return null;
    localStorage.removeItem(TARGET_KEY);
    const v = JSON.parse(raw) as { t?: unknown; at?: unknown };
    if (typeof v.at !== "number" || now - v.at > LOCAL_TARGET_TTL_MS || now < v.at) return null;
    return isSafeInternalPath(v.t) ? v.t : null;
  } catch {
    return null;
  }
}

export function takeLoginRedirect(now: number = Date.now()): string | null {
  let session: string | null = null;
  try {
    const v = sessionStorage.getItem(TARGET_KEY);
    if (v) sessionStorage.removeItem(TARGET_KEY);
    session = isSafeInternalPath(v) ? v : null;
  } catch {
    session = null;
  }
  const local = takeLocalTarget(now);
  return session ?? local;
}
