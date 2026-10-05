/**
 * Reine Hilfen für die aufklappbaren Kalender-Details im Admin.
 * Keine Geschäftslogik: nur Darstellung, Berliner Zeit und Dokumentauswahl.
 */
import { ageOnIsoDate, isValidIsoDate, todayIsoBerlin } from "@/lib/age";
import { berlinWallClockToMs } from "@/lib/berlin-time";

export const BERLIN_TZ = "Europe/Berlin";
export const NOT_SET = "Nicht hinterlegt";
export const NO_NOTES = "Keine Hinweise hinterlegt";

const dateFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: BERLIN_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: BERLIN_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "09.10.2026, 16:00 Uhr" – immer Europe/Berlin, unabhängig von der Browser-Zeitzone. */
export function fmtBerlinDateTime(d: Date | number): string {
  const date = typeof d === "number" ? new Date(d) : d;
  return `${dateFmt.format(date)}, ${timeFmt.format(date)} Uhr`;
}

/**
 * Berliner Kalendertag [start, end) für eine Kalenderzelle (Jahr/Monat/Tag
 * als Ziffern, nicht als Browser-Zeitpunkt).
 */
export function berlinDayRangeMs(year: number, month1: number, day: number): { start: number; end: number } {
  const start = berlinWallClockToMs(year, month1, day, 0);
  const next = new Date(Date.UTC(year, month1 - 1, day + 1));
  const end = berlinWallClockToMs(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0);
  return { start, end };
}

/** Überschneidet sich [startMs, endMs) mit dem Berliner Kalendertag? */
export function overlapsBerlinDay(
  startMs: number,
  endMs: number,
  year: number,
  month1: number,
  day: number,
): boolean {
  const r = berlinDayRangeMs(year, month1, day);
  return startMs < r.end && endMs > r.start;
}

export function fmtIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Geburtsdatum + aktuelles Alter getrennt; ungültig/zukünftig → kein Alter. */
export function birthAndAge(
  iso: string | null | undefined,
  todayIso: string = todayIsoBerlin(),
): { birth: string; age: string } {
  if (!iso) return { birth: NOT_SET, age: NOT_SET };
  if (!isValidIsoDate(iso)) return { birth: "Ungültiges Datum hinterlegt", age: NOT_SET };
  const age = ageOnIsoDate(iso, todayIso);
  return { birth: fmtIsoDate(iso), age: age === null ? NOT_SET : `${age} Jahre` };
}

export function clean(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Anschrift aus Einzelteilen; null wenn nichts gespeichert ist. */
export function joinAddress(parts: {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
}): string | null {
  const street = clean(parts.street);
  const place = [clean(parts.postalCode), clean(parts.city)].filter(Boolean).join(" ");
  const out = [street, place || null, clean(parts.country)].filter(Boolean);
  return out.length ? out.join(", ") : null;
}

export type DocSide = "front" | "back";
export type DocGroup = "license" | "id";

export const DOC_TYPE_MAP: Record<string, { group: DocGroup; side: DocSide }> = {
  license_front: { group: "license", side: "front" },
  license_back: { group: "license", side: "back" },
  id_front: { group: "id", side: "front" },
  id_back: { group: "id", side: "back" },
};

export type RawDoc = {
  id: string;
  doc_type: string;
  path: string;
  created_at: string;
  deleted?: boolean;
  original_name?: string | null;
};

/**
 * Je Dokumentseite der neueste nicht entfernte Eintrag; nur falls keiner
 * vorhanden ist, der neueste vom Nutzer entfernte (gekennzeichnet).
 * Unbekannte Typen landen unter „Weitere Dokumente".
 */
export function pickDocuments(rows: RawDoc[]): {
  slots: Partial<Record<keyof typeof DOC_TYPE_MAP, RawDoc>>;
  others: RawDoc[];
} {
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const slots: Partial<Record<string, RawDoc>> = {};
  const others: RawDoc[] = [];
  for (const r of sorted) {
    if (!DOC_TYPE_MAP[r.doc_type]) {
      others.push(r);
      continue;
    }
    const cur = slots[r.doc_type];
    if (!cur || (cur.deleted && !r.deleted)) slots[r.doc_type] = r;
  }
  return { slots, others };
}

/**
 * Relativer Storage-Pfad ohne URL/Traversal, der mit dem erwarteten Präfix
 * beginnt (z. B. "<user_id>/"). Schützt davor, dass eine Kundenzeile einen
 * fremden Pfad enthält, der dann mit Adminrechten signiert würde.
 */
export function isSafeOwnedPath(path: string | null | undefined, prefix: string, mustContain?: string): boolean {
  if (typeof path !== "string" || !path || !prefix) return false;
  if (path.startsWith("/") || path.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  const segs = path.split("/");
  if (segs.some((s) => s === "" || s === "." || s === ".." || /%2e|%2f/i.test(s))) return false;
  if (!path.startsWith(prefix)) return false;
  if (mustContain && !path.includes(mustContain)) return false;
  return true;
}

export function isPdfPath(path: string | null | undefined): boolean {
  return !!path && /\.pdf($|\?)/i.test(path);
}
