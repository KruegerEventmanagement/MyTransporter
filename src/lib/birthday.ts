/**
 * Geburtstagsaktion – reine, testbare Kernlogik.
 *
 * Wichtig: Der Rabatt gilt ausschließlich auf die Mietleistung. Kaution,
 * Mehrkilometer, Tankkosten, Schadenersatz und durchlaufende Posten bleiben
 * unberührt.
 */

export const BIRTHDAY_DISCOUNT_PERCENT = 20;
/** Gültigkeit ab Geburtstag (inklusive) in Tagen. */
export const BIRTHDAY_COUPON_VALID_DAYS = 14;
/** Mindestalter für eine Buchung bei MyTransporter. */
export const MIN_DRIVER_AGE = 25;

/** Kalenderdatum (YYYY-MM-DD) in Europe/Berlin für einen Zeitpunkt. */
export function berlinDateParts(at: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  iso: string;
} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    year,
    month,
    day,
    hour: get("hour"),
    iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Hat die Person am gegebenen Tag (Berliner Kalendertag) Geburtstag?
 * Schaltjahr-Regel: 29.02.-Geburtstage werden in Nicht-Schaltjahren am 28.02.
 * gefeiert.
 */
export function isBirthdayOn(
  birthDate: string,
  today: { year: number; month: number; day: number },
): boolean {
  const [, mRaw, dRaw] = birthDate.split("-").map(Number);
  if (!mRaw || !dRaw) return false;
  const month = mRaw;
  let day = dRaw;
  if (month === 2 && day === 29 && !isLeapYear(today.year)) day = 28;
  return month === today.month && day === today.day;
}

/** Alter in Jahren am Referenzdatum. */
export function ageOn(birthDate: string, ref: Date = new Date()): number | null {
  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  let age = ref.getUTCFullYear() - y;
  const beforeBirthday =
    ref.getUTCMonth() + 1 < m || (ref.getUTCMonth() + 1 === m && ref.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Erzeugt einen personengebundenen, nicht erratbaren Gutscheincode. */
export function generateCouponCode(random: () => number = Math.random): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(random() * alphabet.length)];
  }
  return `MTBDAY-${code}`;
}

export function normalizeCouponCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/** Rabatt in Cent – nur auf die Mietleistung, immer abgerundet auf ganze Cent. */
export function discountCentsForRent(
  rentCents: number,
  percent: number = BIRTHDAY_DISCOUNT_PERCENT,
): number {
  if (!Number.isFinite(rentCents) || rentCents <= 0) return 0;
  return Math.floor((rentCents * percent) / 100);
}

/** Gültigkeitsende (inklusive) als YYYY-MM-DD. */
export function couponValidUntil(
  birthdayIso: string,
  days: number = BIRTHDAY_COUPON_VALID_DAYS,
): string {
  const [y, m, d] = birthdayIso.split("-").map(Number);
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export interface CouponRow {
  coupon_code: string;
  user_id: string;
  discount_percent: number;
  valid_from: string;
  valid_until: string;
  redeemed_at: string | null;
}

export type CouponCheck = { ok: true; discountPercent: number } | { ok: false; reason: string };

/** Serverseitige Prüfung eines Gutscheins gegen Nutzer und Zeitraum. */
export function checkCoupon(row: CouponRow | null, userId: string, todayIso: string): CouponCheck {
  if (!row) return { ok: false, reason: "Dieser Gutscheincode ist unbekannt." };
  if (row.user_id !== userId) {
    return { ok: false, reason: "Dieser Gutschein ist persönlich und nicht übertragbar." };
  }
  if (row.redeemed_at) return { ok: false, reason: "Dieser Gutschein wurde bereits eingelöst." };
  if (todayIso < row.valid_from) {
    return { ok: false, reason: "Dieser Gutschein ist noch nicht gültig." };
  }
  if (todayIso > row.valid_until) {
    return { ok: false, reason: "Dieser Gutschein ist leider abgelaufen." };
  }
  return { ok: true, discountPercent: row.discount_percent };
}
