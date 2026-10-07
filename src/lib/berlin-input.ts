/**
 * Datum/Uhrzeit-Eingaben im Admin immer als Europe/Berlin – unabhängig von der
 * Zeitzone des Browsers. Sommerzeit-Lücken und doppelte Stunden (Winterzeit)
 * werden abgelehnt statt still verschoben.
 */
import { berlinWallClockToMs } from "@/lib/berlin-time";

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Zeitpunkt → Berliner Eingabewerte ("2026-10-11", "09:00"). */
export function berlinInputFromDate(d: Date): { date: string; time: string } {
  const p = fmt.formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
}

export type BerlinParse = { ok: true; date: Date } | { ok: false; error: string };

export function berlinInputToDate(date: string, time: string): BerlinParse {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  const tm = /^(\d{2}):(\d{2})$/.exec(time ?? "");
  if (!dm || !tm) return { ok: false, error: "Bitte Datum und Uhrzeit vollständig angeben" };
  const [y, mo, d, h, mi] = [dm[1], dm[2], dm[3], tm[1], tm[2]].map(Number);
  if (h > 23 || mi > 59) return { ok: false, error: "Ungültige Uhrzeit" };
  const ms = berlinWallClockToMs(y, mo, d, h, mi);
  const back = berlinInputFromDate(new Date(ms));
  if (back.date !== date || back.time !== time) {
    return { ok: false, error: `${date} ${time} gibt es in Berlin nicht (Zeitumstellung oder ungültiges Datum)` };
  }
  for (const delta of [-3600_000, 3600_000]) {
    const o = berlinInputFromDate(new Date(ms + delta));
    if (o.date === date && o.time === time) {
      return { ok: false, error: `${date} ${time} ist wegen der Zeitumstellung doppelt – bitte eine andere Uhrzeit wählen` };
    }
  }
  return { ok: true, date: new Date(ms) };
}
