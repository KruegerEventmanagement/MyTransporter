/**
 * Rückgabeentwurf pro Nutzer + Buchung (localStorage, nur kleine Werte –
 * Fotos liegen ausschließlich in IndexedDB bzw. bestätigt im Server).
 *
 * Konfliktregel (mehrere Tabs): Jeder Schreiber übergibt NUR die tatsächlich
 * geänderten Felder; sie werden auf den gerade gespeicherten Stand gelegt
 * (Read-Modify-Write), alle anderen Felder bleiben unangetastet. Jede Änderung
 * erhöht `rev`; andere Tabs übernehmen sie per storage-Ereignis. Ein explizit
 * älterer Zeitstempel überschreibt nie einen neueren; gleiche ms gelten als neuer.
 */
import type { ReturnExceptions } from "./trip-return";

/** "photos" | "km" | "receipt" stammen aus der alten Rückgabeansicht und werden als "wizard" fortgesetzt. */
export type DraftStep = "intro" | "wizard" | "overview" | "photos" | "km" | "receipt" | "code";

export interface ReturnDraft {
  v: 1;
  updatedAt: number;
  /** Monoton steigende Revision je Schreibvorgang. */
  rev: number;
  /** Kunde hat die Rückgabe gestartet (Fahrtansicht → Rückgabe). */
  started: boolean;
  step: DraftStep;
  endKm: string;
  endKmManual: boolean;
  endFuelPercent: string;
  exceptions: ReturnExceptions;
  addonsReturned: boolean;
  returnCode: string | null;
  /** Meldung offline angefordert, Server hat noch nicht bestätigt. */
  reportPending: boolean;
  /** Wizard: aktuelle Folie. */
  slide: number;
  /** Kunde hat während der Miete getankt (→ Tankbeleg-Schritt). null = noch nicht beantwortet. */
  refueled: boolean | null;
}

export type DraftFields = Omit<ReturnDraft, "v" | "updatedAt" | "rev">;

export function emptyDraft(): ReturnDraft {
  return {
    v: 1,
    updatedAt: 0,
    rev: 0,
    started: false,
    step: "photos",
    endKm: "",
    endKmManual: false,
    endFuelPercent: "",
    exceptions: {},
    addonsReturned: false,
    returnCode: null,
    reportPending: false,
    slide: 0,
    refueled: null,
  };
}

export const draftKey = (userId: string, bookingId: string) => `mt_return_draft_v1:${userId}:${bookingId}`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function parseReturnDraft(raw: string | null): ReturnDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<ReturnDraft>;
    if (d?.v !== 1) return null;
    const out = { ...emptyDraft(), ...d } as ReturnDraft;
    if (!Number.isInteger(out.rev) || out.rev < 0) out.rev = 0;
    return out;
  } catch {
    return null;
  }
}

export function loadReturnDraft(userId: string, bookingId: string): ReturnDraft | null {
  const s = storage();
  if (!s) return null;
  try {
    return parseReturnDraft(s.getItem(draftKey(userId, bookingId)));
  } catch {
    return null;
  }
}

/**
 * Legt nur die übergebenen Felder auf den aktuellen Stand. Gibt false bei
 * blockiertem/vollem Speicher – dann darf die UI keine Sicherung behaupten.
 */
export function saveReturnDraft(
  userId: string,
  bookingId: string,
  patch: Partial<DraftFields> & { updatedAt?: number },
  now = Date.now(),
): boolean {
  const s = storage();
  if (!s) return false;
  const cur = loadReturnDraft(userId, bookingId) ?? emptyDraft();
  const ts = patch.updatedAt ?? now;
  if (cur.updatedAt > ts) return true;
  const fields: Partial<DraftFields> = { ...patch };
  delete (fields as { updatedAt?: number }).updatedAt;
  delete (fields as { v?: number }).v;
  delete (fields as { rev?: number }).rev;
  const next: ReturnDraft = { ...cur, ...fields, v: 1, updatedAt: ts, rev: cur.rev + 1 };
  try {
    s.setItem(draftKey(userId, bookingId), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

const FIELD_KEYS: (keyof DraftFields)[] = [
  "started",
  "step",
  "endKm",
  "endKmManual",
  "endFuelPercent",
  "exceptions",
  "addonsReturned",
  "returnCode",
  "reportPending",
  "slide",
  "refueled",
];

function same(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** Nur die Felder, die sich gegenüber dem zuletzt selbst geschriebenen/übernommenen Stand geändert haben. */
export function diffDraftFields(prev: Partial<DraftFields>, next: DraftFields): Partial<DraftFields> {
  const out: Partial<DraftFields> = {};
  for (const k of FIELD_KEYS) if (!same(prev[k], next[k])) (out as Record<string, unknown>)[k] = next[k];
  return out;
}

export function clearReturnDraft(userId: string, bookingId: string): void {
  try {
    storage()?.removeItem(draftKey(userId, bookingId));
  } catch {
    /* ignore */
  }
}

/** Navigation/Karte pro Nutzer + Buchung. */
export interface TripNavState {
  destination: { lat: number; lng: number; label: string } | null;
  routeIndex: number;
  navMode: boolean;
  gpsChoice: "granted" | "declined" | null;
}

const navKey = (userId: string, bookingId: string) => `mt_trip_nav_v1:${userId}:${bookingId}`;

export function loadTripNav(userId: string, bookingId: string): TripNavState {
  const fallback: TripNavState = { destination: null, routeIndex: 0, navMode: false, gpsChoice: null };
  try {
    const raw = storage()?.getItem(navKey(userId, bookingId));
    if (!raw) return fallback;
    const d = JSON.parse(raw) as Partial<TripNavState>;
    const dest = d.destination;
    const validDest =
      dest && Number.isFinite(dest.lat) && Number.isFinite(dest.lng) && typeof dest.label === "string" ? dest : null;
    return {
      destination: validDest,
      routeIndex: Number.isInteger(d.routeIndex) && (d.routeIndex as number) >= 0 ? (d.routeIndex as number) : 0,
      navMode: !!validDest && d.navMode === true,
      gpsChoice: d.gpsChoice === "granted" || d.gpsChoice === "declined" ? d.gpsChoice : null,
    };
  } catch {
    return fallback;
  }
}

export function saveTripNav(userId: string, bookingId: string, patch: Partial<TripNavState>): void {
  try {
    const next = { ...loadTripNav(userId, bookingId), ...patch };
    storage()?.setItem(navKey(userId, bookingId), JSON.stringify(next));
  } catch {
    /* Speicher voll/blockiert: Navigation läuft trotzdem */
  }
}
