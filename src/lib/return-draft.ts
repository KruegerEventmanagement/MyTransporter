/**
 * Rückgabeentwurf pro Nutzer + Buchung (localStorage, nur kleine Werte –
 * Fotos liegen ausschließlich in IndexedDB bzw. bestätigt im Server).
 * Ältere Stände überschreiben nie neuere.
 */
import type { ReturnExceptions } from "./trip-return";

export type DraftStep = "photos" | "km" | "receipt" | "code";

export interface ReturnDraft {
  v: 1;
  updatedAt: number;
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
}

export function emptyDraft(): ReturnDraft {
  return {
    v: 1,
    updatedAt: 0,
    started: false,
    step: "photos",
    endKm: "",
    endKmManual: false,
    endFuelPercent: "",
    exceptions: {},
    addonsReturned: false,
    returnCode: null,
    reportPending: false,
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

export function loadReturnDraft(userId: string, bookingId: string): ReturnDraft | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(draftKey(userId, bookingId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<ReturnDraft>;
    if (d?.v !== 1) return null;
    return { ...emptyDraft(), ...d } as ReturnDraft;
  } catch {
    return null;
  }
}

/** Speichert, außer ein neuerer Stand liegt bereits vor. Gibt false bei Speicherfehler. */
export function saveReturnDraft(userId: string, bookingId: string, patch: Partial<ReturnDraft>, now = Date.now()): boolean {
  const s = storage();
  if (!s) return false;
  const cur = loadReturnDraft(userId, bookingId) ?? emptyDraft();
  const ts = patch.updatedAt ?? now;
  if (cur.updatedAt > ts) return true;
  const next: ReturnDraft = { ...cur, ...patch, v: 1, updatedAt: ts };
  try {
    s.setItem(draftKey(userId, bookingId), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
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
