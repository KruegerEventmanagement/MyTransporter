/** E-Mail-Eingabe bereinigen: iPhone-Autofill/Autokorrektur fügt oft Leerzeichen oder Großbuchstaben ein. */
export function normalizeEmail(raw: string): string {
  return (raw ?? "").replace(/\s+/g, "").toLowerCase();
}

/** Verständliche deutsche Fehlermeldungen für Login/Registrierung. */
export function authErrorMessage(raw: string | null | undefined): string {
  const m = String(raw ?? "");
  if (/invalid login credentials/i.test(m))
    return "E-Mail oder Passwort stimmt nicht. Bitte prüfe deine Eingabe oder nutze „Passwort vergessen?“.";
  if (/email not confirmed/i.test(m))
    return "Bitte bestätige zuerst deine E-Mail-Adresse über den Link in unserer Mail.";
  if (/already registered|already exists/i.test(m))
    return "Für diese E-Mail gibt es schon ein Konto. Bitte melde dich an.";
  if (/password should be at least|weak password/i.test(m))
    return "Das Passwort ist zu kurz oder zu einfach. Bitte mindestens 6 Zeichen verwenden.";
  if (/invalid email|unable to validate email/i.test(m))
    return "Bitte gib eine gültige E-Mail-Adresse ein.";
  if (/rate limit|too many/i.test(m))
    return "Zu viele Versuche. Bitte warte kurz und versuche es dann erneut.";
  if (/timeout|timed out|zeitüberschreitung|failed to fetch|network/i.test(m))
    return "Keine Verbindung. Bitte prüfe dein Internet und versuche es erneut.";
  return m || "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
}

/** Fehler, bei denen ein Passwort-Reset der richtige nächste Schritt ist (roh oder übersetzt). */
export function suggestsPasswordReset(text: string | null | undefined): boolean {
  const m = String(text ?? "");
  return /invalid login credentials|E-Mail oder Passwort stimmt nicht|bereits registriert|schon ein Konto|already registered|already exists/i.test(m);
}

/** Eingabe-Attribute, damit iPhone nichts automatisch verändert. */
export const emailInputProps = {
  autoComplete: "email",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
  inputMode: "email",
} as const;
