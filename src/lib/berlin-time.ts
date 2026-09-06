/**
 * Zeitzonen-sichere Umrechnung von Wanduhrzeiten (Europe/Berlin) in echte
 * Zeitpunkte. Buchungen speichern `start_date` + `start_hour` als LOKALE
 * Berliner Zeit. Wird das mit `new Date("2026-09-18T14:00:00")` geparst,
 * gilt die Zeitzone der jeweiligen Laufzeit (Server = UTC) – das verschob
 * Sperrzeiten im Sommer um 2 Stunden.
 *
 * Entspricht der DB-Funktion `public.local_start_at(date, hour)`.
 */

const BERLIN = "Europe/Berlin";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BERLIN,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Offset (ms) von Europe/Berlin gegenüber UTC zum gegebenen Zeitpunkt. */
function berlinOffsetMs(utcMs: number): number {
  const p = partsFormatter.formatToParts(new Date(utcMs));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - utcMs;
}

/** Berliner Wanduhrzeit → echter Zeitpunkt (ms since epoch). */
export function berlinWallClockToMs(
  year: number,
  month1: number,
  day: number,
  hour: number,
  minute = 0,
): number {
  const guess = Date.UTC(year, month1 - 1, day, hour, minute, 0, 0);
  // Zweistufig, damit auch die Sommer-/Winterzeitumstellung korrekt trifft.
  let utc = guess - berlinOffsetMs(guess);
  utc = guess - berlinOffsetMs(utc);
  return utc;
}

/** "2026-09-18" + 14 → Zeitpunkt von 14:00 Berliner Zeit. */
export function berlinDateHourToMs(dateStr: string, hour: number): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return berlinWallClockToMs(y ?? 1970, m ?? 1, d ?? 1, hour);
}

/** Kalendertag (lokal gedacht) + Stunde → Zeitpunkt in Berliner Zeit. */
export function berlinDayHourToMs(day: Date, hour: number): number {
  return berlinWallClockToMs(day.getFullYear(), day.getMonth() + 1, day.getDate(), hour);
}
