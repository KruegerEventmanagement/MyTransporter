/**
 * Passwort vergessen / zurücksetzen. Mailziel ist immer eine öffentliche
 * Web-Origin – nie localhost oder die native App-Shell.
 */
export const PASSWORD_MIN_LENGTH = 6;
export const CANONICAL_ORIGIN = "https://mytransporter.org";
export const RESET_PATH = "/reset-password";

const ALLOWED_HOSTS = new Set(["mytransporter.org", "www.mytransporter.org", "mytransporter.lovable.app"]);

export function passwordResetRedirect(origin: string | null | undefined): string {
  try {
    const u = new URL(origin ?? "");
    const ok =
      u.protocol === "https:" &&
      (ALLOWED_HOSTS.has(u.hostname) || /^id-preview--[a-z0-9-]+\.lovable\.app$/.test(u.hostname));
    return `${ok ? u.origin : CANONICAL_ORIGIN}${RESET_PATH}`;
  } catch {
    return `${CANONICAL_ORIGIN}${RESET_PATH}`;
  }
}

export function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

export const NEUTRAL_RESET_MESSAGE =
  "Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link zum Zurücksetzen geschickt. Bitte prüfe auch den Spam-Ordner.";

export function isRateLimitError(err: { status?: number; code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.status === 429 || /rate|too many|security purposes|over_email_send_rate/i.test(`${err.code ?? ""} ${err.message ?? ""}`);
}

type ResetClient = {
  auth: {
    resetPasswordForEmail: (
      email: string,
      opts: { redirectTo: string },
    ) => Promise<{ error: { status?: number; code?: string; message?: string } | null }>;
  };
};

/** Neutrale Antwort (keine Kontenaufzählung); nur Format- und Ratenlimitfehler werden benannt. */
export async function requestPasswordReset(
  client: ResetClient,
  email: string,
  origin: string | null | undefined,
): Promise<{ ok: boolean; message: string }> {
  const clean = email.trim().toLowerCase();
  if (!isValidEmail(clean)) return { ok: false, message: "Bitte gib eine gültige E-Mail-Adresse ein." };
  try {
    const { error } = await client.auth.resetPasswordForEmail(clean, { redirectTo: passwordResetRedirect(origin) });
    if (isRateLimitError(error)) {
      return { ok: false, message: "Zu viele Anfragen. Bitte warte ein paar Minuten und versuche es dann erneut." };
    }
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
