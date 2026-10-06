/** Datum/Uhrzeit in Europe/Berlin, z. B. { date: "06.10.2026", time: "21:33" }. */
export function formatBerlinDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${g("day")}.${g("month")}.${g("year")}`, time: `${g("hour")}:${g("minute")}` };
}
