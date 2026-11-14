/** Betreiberanweisung: diese Adressen bekommen nie eine Bewertungs-/Feedbackmail. */
export const FEEDBACK_EXCLUDED_EMAILS = [
  "rainerrene11@web.de",
  "moein.baghery@gmail.com", // Moein Baghery, 14.11.2026
  "ante.mihalj@live.com", // Ante Mihalj, 14.11.2026
];

export function isFeedbackExcluded(email: string | null | undefined): boolean {
  return FEEDBACK_EXCLUDED_EMAILS.includes((email ?? "").trim().toLowerCase());
}
