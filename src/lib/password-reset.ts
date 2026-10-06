/**
 * Passwort vergessen / zurücksetzen. Mailziel ist immer die kanonische
 * Live-Adresse – nie localhost, App-Shell, www (Umleitung kann Hash/PKCE
 * verlieren) oder fremde Vorschau-Domains.
 */
export const PASSWORD_MIN_LENGTH = 6;
export const CANONICAL_ORIGIN = "https://mytransporter.org";
export const RESET_PATH = "/reset-password";
export const RESET_REDIRECT_URL = `${CANONICAL_ORIGIN}${RESET_PATH}`;

/** Bewusst ohne Eingabe: das Ziel ist immer dieselbe kanonische Adresse. */
export function passwordResetRedirect(_origin?: string | null): string {
  return RESET_REDIRECT_URL;
}

export function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

export const NEUTRAL_RESET_MESSAGE =
  "Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link zum Zurücksetzen geschickt. Bitte prüfe auch den Spam-Ordner.";
export const RESET_SEND_FAILED_MESSAGE =
  "Der Link konnte gerade nicht versendet werden. Bitte versuche es später erneut oder schreibe an info@mytransporter.org.";

type AuthErr = { status?: number; code?: string; message?: string } | null | undefined;

export function isRateLimitError(err: AuthErr): boolean {
  if (!err) return false;
  return err.status === 429 || /rate|too many|security purposes|over_email_send_rate/i.test(`${err.code ?? ""} ${err.message ?? ""}`);
}

type ResetClient = {
  auth: {
    resetPasswordForEmail: (email: string, opts: { redirectTo: string }) => Promise<{ error: AuthErr }>;
  };
};

/**
 * Neutrale Antwort nur bei angenommenem Auftrag (keine Kontenaufzählung –
 * der Dienst unterscheidet bekannte/unbekannte Adressen ohnehin nicht).
 * Jeder Fehler (5xx, Mailversand, Netz) wird ehrlich als „nicht versendet“ gemeldet.
 */
export async function requestPasswordReset(
  client: ResetClient,
  email: string,
  _origin?: string | null,
): Promise<{ ok: boolean; message: string }> {
  const clean = email.trim().toLowerCase();
  if (!isValidEmail(clean)) return { ok: false, message: "Bitte gib eine gültige E-Mail-Adresse ein." };
  try {
    const { error } = await client.auth.resetPasswordForEmail(clean, { redirectTo: RESET_REDIRECT_URL });
    if (isRateLimitError(error)) {
      return { ok: false, message: "Zu viele Anfragen. Bitte warte ein paar Minuten und versuche es dann erneut." };
    }
    if (error) return { ok: false, message: RESET_SEND_FAILED_MESSAGE };
  } catch {
    return { ok: false, message: "Verbindung fehlgeschlagen. Bitte versuche es erneut." };
  }
  return { ok: true, message: NEUTRAL_RESET_MESSAGE };
}

export type RecoveryLink =
  | { kind: "code"; code: string }
  | { kind: "token_hash"; tokenHash: string }
  | { kind: "implicit" }
  | { kind: "error"; expired: boolean }
  | { kind: "none" };

export function parseRecoveryUrl(href: string): RecoveryLink {
  const u = new URL(href);
  const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
  const q = u.searchParams;
  const errCode = hash.get("error_code") ?? q.get("error_code") ?? hash.get("error") ?? q.get("error");
  if (errCode) return { kind: "error", expired: /expired|otp|access_denied/i.test(errCode) };
  const code = q.get("code");
  if (code) return { kind: "code", code };
  const th = q.get("token_hash");
  if (th && (q.get("type") ?? "recovery") === "recovery") return { kind: "token_hash", tokenHash: th };
  if (hash.get("access_token") && hash.get("type") === "recovery") return { kind: "implicit" };
  return { kind: "none" };
}

export function validateNewPassword(a: string, b: string): string | null {
  if (a.length < PASSWORD_MIN_LENGTH) return `Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`;
  if (a !== b) return "Die Passwörter stimmen nicht überein.";
  return null;
}

export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  try {
    const part = String(token ?? "").split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

/** Recovery-Sitzung frisch genug (1 h) – künftige Zeitstempel (>60 s) gelten nicht. */
export const RECOVERY_MAX_AGE_SECONDS = 3600;

export function isRecoveryAccessToken(token: string | null | undefined, nowSec: number, allowOtp = false): boolean {
  const p = decodeJwtPayload(token);
  const amr = Array.isArray(p?.amr) ? (p!.amr as Array<{ method?: string; timestamp?: number }>) : [];
  return amr.some((a) => {
    const ok = a?.method === "recovery" || (allowOtp && a?.method === "otp");
    const ts = Number(a?.timestamp) || 0;
    return ok && ts > 0 && ts <= nowSec + 60 && nowSec - ts <= RECOVERY_MAX_AGE_SECONDS;
  });
}

type RecoveryClient = {
  auth: {
    exchangeCodeForSession: (code: string) => Promise<{ error: unknown }>;
    verifyOtp: (p: { token_hash: string; type: "recovery" }) => Promise<{ error: unknown }>;
    getSession: () => Promise<{ data: { session: { access_token: string; user: { id: string } } | null } }>;
    getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
};

export type RecoveryCheck = { ok: true } | { ok: false; expired: boolean; network?: boolean };

/**
 * Schaltet das Formular nur für eine nachweisliche Recovery-Sitzung frei:
 * Token-AMR „recovery“ (bzw. „otp“ direkt nach verifyOtp type=recovery),
 * serverseitig bestätigter Nutzer = Sitzungsnutzer. Eine vorhandene normale
 * Sitzung + gefälschter/abgelaufener Link wird abgelehnt.
 */
export async function resolveRecovery(client: RecoveryClient, link: RecoveryLink, nowSec: number): Promise<RecoveryCheck> {
  if (link.kind === "error") return { ok: false, expired: link.expired };
  try {
    let allowOtp = false;
    if (link.kind === "code") {
      if ((await client.auth.exchangeCodeForSession(link.code)).error) return { ok: false, expired: true };
    } else if (link.kind === "token_hash") {
      if ((await client.auth.verifyOtp({ token_hash: link.tokenHash, type: "recovery" })).error) return { ok: false, expired: true };
      allowOtp = true;
    }
    const { data } = await client.auth.getSession();
    const s = data.session;
    if (!s || !isRecoveryAccessToken(s.access_token, nowSec, allowOtp)) return { ok: false, expired: link.kind !== "none" };
    const u = await client.auth.getUser();
    if (u.error || !u.data.user || u.data.user.id !== s.user.id) return { ok: false, expired: true };
    return { ok: true };
  } catch {
    return { ok: false, expired: false, network: true };
  }
}
