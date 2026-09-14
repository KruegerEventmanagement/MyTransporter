/**
 * Kalendergenaue Altersprüfung für die Registrierung.
 * Mindestalter bei MyTransporter: 25 Jahre (siehe MIN_DRIVER_AGE).
 */

export const MIN_REGISTRATION_AGE = 25;

export const MIN_AGE_MESSAGE =
  "MyTransporter ist erst ab 25 Jahren mietbar. Eine Registrierung ist daher erst ab deinem 25. Geburtstag möglich.";

/** true, wenn der String ein plausibles ISO-Datum YYYY-MM-DD ist. */
export function isValidIsoDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1900
  );
}

/** Heutiges Datum als YYYY-MM-DD in Europe/Berlin. */
export function todayIsoBerlin(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * Alter in vollen Jahren am Referenztag – kalendergenau (Tag/Monat/Jahr).
 * Gibt null zurück, wenn das Geburtsdatum ungültig oder in der Zukunft liegt.
 */
export function ageOnIsoDate(birthIso: string, todayIso: string): number | null {
  if (!isValidIsoDate(birthIso) || !isValidIsoDate(todayIso)) return null;
  if (birthIso > todayIso) return null;
  const [by, bm, bd] = birthIso.split("-").map(Number);
  const [ty, tm, td] = todayIso.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Erfüllt das Geburtsdatum am Referenztag das Mindestalter? */
export function meetsMinimumAge(
  birthIso: string,
  todayIso: string = todayIsoBerlin(),
  minAge: number = MIN_REGISTRATION_AGE,
): boolean {
  const age = ageOnIsoDate(birthIso, todayIso);
  return age !== null && age >= minAge;
}
