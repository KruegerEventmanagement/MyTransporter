/**
 * Serverseitige Datenschutz-Abläufe: Dokumente aus dem Kundenkonto entfernen
 * (mit befristetem Adminarchiv), Kontolöschung inkl. Wiederaufnahme und
 * Archivbereinigung. Die Logik arbeitet gegen das schmale PrivacyStore-Interface,
 * damit sie vollständig ohne echte Daten getestet werden kann.
 */
import { computeRetention, type RetentionBooking, ALL_IDENTITY_DOC_TYPES } from "./document-retention";
import { BLOCKING_BOOKING_STATUSES } from "./booking-status";
import { isLegacyOpenTrip, isActiveTripStatus, isReturningStatus } from "./active-trip";
import { resolveTripWindow } from "./trip-time";

export interface DocRow {
  id: string;
  user_id: string;
  doc_type: string;
  photo_url: string;
  created_at: string;
}

export interface ArchiveInsert {
  source_document_id: string;
  user_id: string;
  doc_type: string;
  storage_path: string;
  retention_until: string;
  retention_reason: string;
}

export interface DueArchiveRow {
  id: string;
  storage_path: string | null;
}

export type DeletionClaim = { state: "claimed"; token: string } | { state: string; token?: undefined };

export interface PrivacyStore {
  /** Eigene Dokumente der Typen, die noch nicht aus dem Konto entfernt wurden. */
  listDocs(uid: string, types: readonly string[]): Promise<DocRow[]>;
  listBookings(uid: string): Promise<RetentionBooking[]>;
  /** Vorhandener Archiveintrag zu diesem Quelldokument (auch bereits bereinigt). */
  getArchive(sourceDocId: string): Promise<{ storage_path: string | null } | null>;
  archiveObjectExists(path: string): Promise<boolean>;
  /** null = Datei existiert nicht (mehr). */
  download(path: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  /** Darf bei bereits vorhandener Datei nicht überschreiben und nicht fehlschlagen. */
  uploadArchive(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Doppelte source_document_id ist kein Fehler; alle anderen Fehler werfen. */
  insertArchive(row: ArchiveInsert): Promise<void>;
  /** Kompensation: unprotokolliertes Archivobjekt entfernen. */
  removeArchiveFile(path: string): Promise<void>;
  removeUserFiles(paths: string[]): Promise<void>;
  /** Setzt beide Zeitstempel in EINEM geprüften Update. */
  markRemoved(docId: string, uid: string): Promise<void>;
  // Kontolöschung
  isAdminUser(uid: string): Promise<boolean>;
  claimDeletion(uid: string, accountCreatedAt: string | null, create: boolean): Promise<DeletionClaim>;
  renewDeletion(uid: string, token: string): Promise<boolean>;
  requestDeletion(uid: string, accountCreatedAt: string | null, reason: string): Promise<string | null>;
  completeDeletion(uid: string, token: string, bookingCount: number): Promise<string | null>;
  failDeletion(uid: string, token: string, error: string): Promise<void>;
  deletionStatus(uid: string): Promise<{ status: string; requested_at: string; completed_at: string | null } | null>;
  listResumableDeletions(nowIso: string, limit: number): Promise<string[]>;
  listUserFiles(uid: string): Promise<string[]>;
  deleteUserDocumentRows(uid: string): Promise<void>;
  deleteDevicesAndMarketing(uid: string): Promise<void>;
  countBookings(uid: string): Promise<number>;
  deleteAuthUser(uid: string): Promise<"deleted" | "missing">;
  deleteProfile(uid: string): Promise<void>;
  // Archivbereinigung
  listDueArchive(nowIso: string, limit: number): Promise<DueArchiveRow[]>;
  markPurged(id: string): Promise<void>;
}

function extOf(path: string): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(path);
  return m ? `.${m[1]!.toLowerCase()}` : "";
}

export interface RemovalResult {
  processed: number;
  archived: number;
  deleted: number;
}

/**
 * Entfernt Dokumente aus dem Konto. Reihenfolge: Archivkopie hochladen →
 * Archiveintrag bestätigen → erst dann Original entfernen → Markierung.
 * Wiederholbar; archiviert nie doppelt; alte Archive bleiben unverändert.
 */
export async function removeDocumentsFromAccount(
  store: PrivacyStore,
  uid: string,
  types: readonly string[],
  nowMs: number,
): Promise<RemovalResult> {
  const docs = (await store.listDocs(uid, types)).filter((d) => d.user_id === uid && types.includes(d.doc_type));
  const bookings = docs.length ? await store.listBookings(uid) : [];
  const res: RemovalResult = { processed: 0, archived: 0, deleted: 0 };
  for (const d of docs) {
    // Nur Dateien im eigenen Ordner anfassen (Schutz gegen manipulierte Pfade).
    const ownPath = d.photo_url.startsWith(`${uid}/`) && !d.photo_url.includes("..");
    const decision = computeRetention(Date.parse(d.created_at), bookings, nowMs);
    let archived = false;
    if (ownPath && decision.action === "archive") {
      const existing = await store.getArchive(d.id);
      if (existing) {
        // Eintrag existiert: referenziertes Objekt muss wirklich vorhanden sein.
        if (existing.storage_path && !(await store.archiveObjectExists(existing.storage_path))) {
          const file = await store.download(d.photo_url);
          if (!file) throw new Error("Archivkopie fehlt und Original nicht lesbar");
          await store.uploadArchive(existing.storage_path, file.bytes, file.contentType);
        }
        archived = true;
      } else {
        const file = await store.download(d.photo_url);
        if (file) {
          const path = `${uid}/${d.id}${extOf(d.photo_url)}`;
          await store.uploadArchive(path, file.bytes, file.contentType);
          try {
            await store.insertArchive({
              source_document_id: d.id,
              user_id: uid,
              doc_type: d.doc_type,
              storage_path: path,
              retention_until: new Date(decision.untilMs).toISOString(),
              retention_reason: decision.reason,
            });
          } catch (e) {
            // Nur entfernen, wenn wirklich kein Eintrag darauf verweist; Original bleibt unangetastet.
            const again = await store.getArchive(d.id).catch(() => ({ storage_path: path }));
            if (!again) await store.removeArchiveFile(path).catch(() => {});
            throw e;
          }
          archived = true;
        }
      }
    }
    if (ownPath) await store.removeUserFiles([d.photo_url]);
    await store.markRemoved(d.id, uid);
    res.processed++;
    if (archived) res.archived++;
    else res.deleted++;
  }
  return res;
}

export interface BlockingBooking extends RetentionBooking {}

/** Laufende oder bevorstehende Miete nach echtem Zeitfenster (Altbuchungs-Regel beachtet). */
export function findBlockingRental(bookings: BlockingBooking[], nowMs: number): BlockingBooking | null {
  const blocking = new Set<string>(BLOCKING_BOOKING_STATUSES);
  for (const b of bookings) {
    if (!blocking.has(String(b.status))) continue;
    const { endMs } = resolveTripWindow(b);
    const ended = endMs <= nowMs;
    if (isLegacyOpenTrip(b) && ended) continue;
    if (isActiveTripStatus(b.status) || isReturningStatus(b.status)) {
      if (!isLegacyOpenTrip(b)) return b;
      continue;
    }
    if (!ended) return b;
  }
  return null;
}

export type DeletionOutcome =
  | { ok: true; completedAt: string | null; already: boolean }
  | { ok: false; kind: "requested"; requestedAt: string | null }
  | { ok: false; kind: "blocked" }
  | { ok: false; kind: "busy" }
  | { ok: false; kind: "admin" }
  | { ok: false; kind: "not_requested" }
  | { ok: false; kind: "failed" };

/**
 * create=true: vom verifizierten Kunden selbst (legt ggf. den Antrag an).
 * create=false: Worker/Admin-Retry – verarbeitet NUR bereits bestehende Anträge.
 */
export async function runAccountDeletion(
  store: PrivacyStore,
  input: { uid: string; accountCreatedAt: string | null; bookings: BlockingBooking[]; nowMs: number; create?: boolean },
): Promise<DeletionOutcome> {
  const { uid } = input;
  const create = input.create !== false;
  // Fail closed: wirft die Rollenprüfung, wird nichts gelöscht.
  if (await store.isAdminUser(uid)) return { ok: false, kind: "admin" };
  const blocker = findBlockingRental(input.bookings, input.nowMs);
  if (blocker) {
    if (!create) return { ok: false, kind: "blocked" };
    const requestedAt = await store.requestDeletion(uid, input.accountCreatedAt, "Löschantrag während laufender oder bevorstehender Miete");
    return { ok: false, kind: "requested", requestedAt };
  }
  const claim = await store.claimDeletion(uid, input.accountCreatedAt, create);
  if (claim.state === "completed") {
    const s = await store.deletionStatus(uid);
    return { ok: true, completedAt: s?.completed_at ?? null, already: true };
  }
  if (claim.state === "unknown") return { ok: false, kind: "not_requested" };
  if (claim.state !== "claimed" || !claim.token) return { ok: false, kind: "busy" };
  const token = claim.token;
  const keep = async () => {
    if (!(await store.renewDeletion(uid, token))) throw new LeaseLost();
  };
  try {
    await removeDocumentsFromAccount(store, uid, ALL_IDENTITY_DOC_TYPES, input.nowMs);
    await keep();
    await store.deleteUserDocumentRows(uid);
    const leftovers = (await store.listUserFiles(uid)).filter((p) => p.startsWith(`${uid}/`));
    if (leftovers.length) await store.removeUserFiles(leftovers);
    await store.deleteDevicesAndMarketing(uid);
    const bookingCount = await store.countBookings(uid);
    await keep();
    await store.deleteAuthUser(uid); // "missing" bei Wiederaufnahme ist ok
    await store.deleteProfile(uid);
    const completedAt = await store.completeDeletion(uid, token, bookingCount);
    return { ok: true, completedAt, already: false };
  } catch (e) {
    if (e instanceof LeaseLost || (e instanceof Error && /lease_lost/.test(e.message))) return { ok: false, kind: "busy" };
    const msg = e instanceof Error ? e.message : "unbekannt";
    await store.failDeletion(uid, token, msg).catch(() => {});
    console.error("account deletion step failed", msg.slice(0, 200));
    return { ok: false, kind: "failed" };
  }
}

class LeaseLost extends Error {
  constructor() {
    super("lease_lost");
  }
}

/** Worker: nimmt beantragte, fehlgeschlagene und abgelaufene Läufe wieder auf. */
export async function resumePendingDeletions(store: PrivacyStore, nowMs: number, limit = 20) {
  const uids = await store.listResumableDeletions(new Date(nowMs).toISOString(), limit);
  const out = { due: uids.length, completed: 0, blocked: 0, failed: 0, skipped: 0 };
  for (const uid of uids) {
    try {
      const bookings = await store.listBookings(uid);
      const r = await runAccountDeletion(store, { uid, accountCreatedAt: null, bookings, nowMs, create: false });
      if (r.ok) out.completed++;
      else if (r.kind === "blocked") out.blocked++;
      else if (r.kind === "failed") out.failed++;
      else out.skipped++;
    } catch {
      out.failed++;
    }
  }
  return out;
}

/** Löscht abgelaufene Archivkopien. Prüfvermerke werden nur bis legal_hold_until respektiert. */
export async function purgeExpiredArchive(store: PrivacyStore, nowMs: number, limit = 100) {
  const due = await store.listDueArchive(new Date(nowMs).toISOString(), limit);
  let purged = 0;
  let failed = 0;
  for (const row of due) {
    try {
      if (row.storage_path) await store.removeArchiveFile(row.storage_path);
      await store.markPurged(row.id);
      purged++;
    } catch {
      failed++;
    }
  }
  return { due: due.length, purged, failed };
}

/** Darf eine Archivkopie (noch) angesehen werden? */
export function isArchiveViewable(
  row: { storage_path: string | null; purged_at: string | null; retention_until: string; legal_hold_until: string | null },
  nowMs: number,
): boolean {
  if (!row.storage_path || row.purged_at) return false;
  return Date.parse(row.retention_until) > nowMs || (!!row.legal_hold_until && Date.parse(row.legal_hold_until) > nowMs);
}
