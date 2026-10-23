/**
 * Dankeschön-Gutschein nach der Miete – reine, testbare Regeln.
 * Unabhängig von Bewertung/Feedback; einmal pro Kunde; nur auf die Mietleistung.
 */
export const THANKS_DISCOUNT_PERCENT = 10;
export const THANKS_VALID_MONTHS = 6;

export function generateThanksCode(random: () => number = Math.random): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(random() * alphabet.length)];
  return `MTDANKE-${code}`;
}

/** Gültig bis (inklusive), 6 Kalendermonate ab Ausstellung (Monatsende wird gekappt). */
export function thanksValidUntil(fromIso: string, months = THANKS_VALID_MONTHS): string {
  const [y, m, d] = fromIso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export interface ThanksCouponRow {
  code: string;
  email_lower: string;
  user_id: string | null;
  discount_percent: number;
  valid_from: string;
  valid_until: string;
  redeemed_at: string | null;
  reserved_until: string | null;
  reserved_by: string | null;
}

export type ThanksCheck = { ok: true; discountPercent: number } | { ok: false; reason: string };

/** Persönlich: gebunden an Konto (user_id) oder – bei manuellen Kunden – an die E-Mail des Kontos. */
export function checkThanksCoupon(
  row: ThanksCouponRow | null,
  who: { userId: string; emailLower: string | null },
  todayIso: string,
  nowMs: number = Date.now(),
): ThanksCheck {
  if (!row) return { ok: false, reason: "Dieser Gutscheincode ist unbekannt." };
  const owner = row.user_id ? row.user_id === who.userId : !!who.emailLower && row.email_lower === who.emailLower;
  if (!owner) return { ok: false, reason: "Dieser Gutschein ist persönlich und nicht übertragbar." };
  if (row.redeemed_at) return { ok: false, reason: "Dieser Gutschein wurde bereits eingelöst." };
  if (todayIso < row.valid_from) return { ok: false, reason: "Dieser Gutschein ist noch nicht gültig." };
  if (todayIso > row.valid_until) return { ok: false, reason: "Dieser Gutschein ist leider abgelaufen." };
  if (row.reserved_until && row.reserved_by !== who.userId && new Date(row.reserved_until).getTime() > nowMs)
    return { ok: false, reason: "Dieser Gutschein wird gerade in einer anderen Zahlung verwendet." };
  return { ok: true, discountPercent: row.discount_percent };
}

/** Fälligkeit der Feedback-Mail: 24 h nach tatsächlicher Rückgabe, sonst nach geplantem Mietende. */
export function feedbackDueAt(planEndMs: number, returnReportedAt: string | null): number {
  const ret = returnReportedAt ? new Date(returnReportedAt).getTime() : NaN;
  const end = Number.isFinite(ret) ? ret : planEndMs;
  return end + 24 * 3600_000;
}
