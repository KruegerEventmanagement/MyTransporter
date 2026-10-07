/**
 * Minimaler letzter bestätigter Stand laufender eigener Fahrten (nur active/returning),
 * gebunden an Nutzer UND Buchung. Nur für Netzfehler; Serverstand ersetzt ihn immer.
 * Keine Zugangscodes (pickup_code/return_code), keine Kunden-/Ausweisdaten.
 */
import { isActiveTripStatus, isLegacyOpenTrip, type ActiveTripRow } from "./active-trip";
import { resolveTripWindow } from "./trip-time";

const PREFIX = "mt_trip_snap_v1:";
/** Nach Mietende + 48 h wird ein Snapshot nicht mehr angezeigt. */
const GRACE_MS = 48 * 3600_000;

export interface TripSnapshotRow extends ActiveTripRow {
  plan_label: string | null;
  start_km: number | null;
  free_km: number | null;
  km_price_cents: number | null;
  addons: Array<{ id: string; label: string; price_cents: number }> | null;
}

interface Store {
  v: 1;
  uid: string;
  savedAt: number;
  rows: Record<string, TripSnapshotRow>;
}

const key = (uid: string) => `${PREFIX}${uid}`;

function ls(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(uid: string): Store | null {
  try {
    const raw = ls()?.getItem(key(uid));
    if (!raw) return null;
    const s = JSON.parse(raw) as Store;
    if (s?.v !== 1 || s.uid !== uid || typeof s.rows !== "object" || !s.rows) return null;
    return s;
  } catch {
    return null;
  }
}

function write(uid: string, rows: Record<string, TripSnapshotRow>, now: number): void {
  try {
    const s = ls();
    if (!s) return;
    if (!Object.keys(rows).length) s.removeItem(key(uid));
    else s.setItem(key(uid), JSON.stringify({ v: 1, uid, savedAt: now, rows } satisfies Store));
  } catch {
    /* Speicher blockiert: kein Offline-Stand, keine Behauptung */
  }
}

function usable(r: TripSnapshotRow, uid: string, now: number): boolean {
  if (r.user_id !== uid || !isActiveTripStatus(r.status) || isLegacyOpenTrip(r)) return false;
  return now <= resolveTripWindow(r).endMs + GRACE_MS;
}

/** Nur die erlaubten Felder übernehmen (keine Codes, keine Personendaten). */
export function toSnapshotRow(b: Record<string, unknown>): TripSnapshotRow {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const addons = Array.isArray(b.addons)
    ? (b.addons as Array<Record<string, unknown>>)
        .filter((a) => a && typeof a.id === "string")
        .map((a) => ({ id: a.id as string, label: String(a.label ?? ""), price_cents: num(a.price_cents) ?? 0 }))
    : null;
  return {
    id: String(b.id),
    user_id: String(b.user_id),
    status: str(b.status),
    start_date: String(b.start_date),
    start_hour: num(b.start_hour),
    plan_id: str(b.plan_id),
    plan_label: str(b.plan_label),
    vehicle_name: str(b.vehicle_name),
    vehicle_plate: str(b.vehicle_plate),
    start_km: num(b.start_km),
    free_km: num(b.free_km),
    km_price_cents: num(b.km_price_cents),
    addons,
  };
}

/** Bestätigte Serverzeile: aktiv → speichern, sonst (abgeschlossen/storniert/fremd/alt) entfernen. */
export function rememberTrip(uid: string, row: Record<string, unknown>, now = Date.now()): void {
  const r = toSnapshotRow(row);
  const s = read(uid);
  const rows = { ...(s?.rows ?? {}) };
  if (usable(r, uid, now)) rows[r.id] = r;
  else delete rows[r.id];
  write(uid, rows, now);
}

export function forgetTrip(uid: string, bookingId: string, now = Date.now()): void {
  const s = read(uid);
  if (!s?.rows[bookingId]) return;
  const rows = { ...s.rows };
  delete rows[bookingId];
  write(uid, rows, now);
}

/** Vollständige bestätigte Liste aktiver Fahrten des Kontos ersetzt alle Snapshots. */
export function replaceTrips(uid: string, list: Record<string, unknown>[], now = Date.now()): void {
  const rows: Record<string, TripSnapshotRow> = {};
  for (const raw of list) {
    const r = toSnapshotRow(raw);
    if (usable(r, uid, now)) rows[r.id] = r;
  }
  write(uid, rows, now);
}

export function loadTrip(uid: string | null, bookingId: string, now = Date.now()): { row: TripSnapshotRow; savedAt: number } | null {
  if (!uid) return null;
  const s = read(uid);
  const r = s?.rows[bookingId];
  return s && r && usable(r, uid, now) ? { row: r, savedAt: s.savedAt } : null;
}

export function loadTrips(uid: string | null, now = Date.now()): TripSnapshotRow[] {
  if (!uid) return [];
  const s = read(uid);
  return s ? Object.values(s.rows).filter((r) => usable(r, uid, now)) : [];
}

/** Abmelden: alle Snapshots aller Konten auf diesem Gerät entfernen. */
export function clearAllTripSnapshots(): void {
  const s = ls();
  if (!s) return;
  try {
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k?.startsWith(PREFIX)) s.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/** Nur echte Verbindungsprobleme erlauben den Offline-Stand; Auth-/Rechtefehler nie. */
export function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = String((err as { message?: unknown })?.message ?? err ?? "");
  return /timeout|Failed to fetch|NetworkError|Load failed|network|fetch failed/i.test(msg);
}
