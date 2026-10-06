/**
 * Serverseitige Datenschutz-Abläufe: Dokumente aus dem Kundenkonto entfernen
 * (mit befristetem Adminarchiv), Kontolöschung und Archivbereinigung.
 * Die Logik arbeitet gegen das schmale PrivacyStore-Interface, damit sie
 * vollständig ohne echte Daten getestet werden kann.
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

export interface PrivacyStore {
  /** Eigene Dokumente der Typen, die noch nicht aus dem Konto entfernt wurden. */
  listDocs(uid: string, types: readonly string[]): Promise<DocRow[]>;
  listBookings(uid: string): Promise<RetentionBooking[]>;
  archiveExists(sourceDocId: string): Promise<boolean>;
  /** null = Datei existiert nicht (mehr). */
  download(path: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  /** Darf bei bereits vorhandener Datei nicht überschreiben und nicht fehlschlagen. */
  uploadArchive(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Doppelte source_document_id ist kein Fehler. */
  insertArchive(row: ArchiveInsert): Promise<void>;
  removeUserFiles(paths: string[]): Promise<void>;
  markRemoved(docId: string, uid: string): Promise<void>;
  // Kontolöschung
  claimDeletion(uid: string, accountCreatedAt: string | null): Promise<string>;
  requestDeletion(uid: string, accountCreatedAt: string | null, reason: string): Promise<string | null>;
  completeDeletion(uid: string, bookingCount: number): Promise<string | null>;
  failDeletion(uid: string, error: string): Promise<void>;
  deletionStatus(uid: string): Promise<{ status: string; requested_at: string; completed_at: string | null } | null>;
  listUserFiles(uid: string): Promise<string[]>;
  deleteUserDocumentRows(uid: string): Promise<void>;
  deleteDevicesAndMarketing(uid: string): Promise<void>;
  countBookings(uid: string): Promise<number>;
  deleteAuthUser(uid: string): Promise<"deleted" | "missing">;
  deleteProfile(uid: string): Promise<void>;
  // Archivbereinigung
  listDueArchive(nowIso: string, limit: number): Promise<DueArchiveRow[]>;
  removeArchiveFile(path: string): Promise<void>;
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

/** Entfernt Dokumente aus dem Konto. Wiederholbar: archiviert nie doppelt. */
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
      if (await store.archiveExists(d.id)) {
        archived = true;
      } else {
        const file = await store.download(d.photo_url);
        if (file) {
          const path = `${uid}/${d.id}${extOf(d.photo_url)}`;
          await store.uploadArchive(path, file.bytes, file.contentType);
          await store.insertArchive({
            source_document_id: d.id,
            user_id: uid,
            doc_type: d.doc_type,
            storage_path: path,
            retention_until: new Date(decision.untilMs).toISOString(),
            retention_reason: decision.reason,
          });
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
  | { ok: false; kind: "busy" }
  | { ok: false; kind: "failed" };

export async function runAccountDeletion(
  store: PrivacyStore,
  input: { uid: string; accountCreatedAt: string | null; bookings: BlockingBooking[]; nowMs: number },
): Promise<DeletionOutcome> {
  const { uid } = input;
  const blocker = findBlockingRental(input.bookings, input.nowMs);
  if (blocker) {
    const requestedAt = await store.requestDeletion(
      uid,
      input.accountCreatedAt,
      "Löschantrag während laufender oder bevorstehender Miete",
    );
    return { ok: false, kind: "requested", requestedAt };
  }
  const claim = await store.claimDeletion(uid, input.accountCreatedAt);
  if (claim === "completed") {
    const s = await store.deletionStatus(uid);
    return { ok: true, completedAt: s?.completed_at ?? null, already: true };
  }
  if (claim !== "claimed") return { ok: false, kind: "busy" };
  try {
    await removeDocumentsFromAccount(store, uid, ALL_IDENTITY_DOC_TYPES, input.nowMs);
    await store.deleteUserDocumentRows(uid);
    const leftovers = (await store.listUserFiles(uid)).filter((p) => p.startsWith(`${uid}/`));
    if (leftovers.length) await store.removeUserFiles(leftovers);
    await store.deleteDevicesAndMarketing(uid);
    const bookingCount = await store.countBookings(uid);
    await store.deleteAuthUser(uid);
    await store.deleteProfile(uid);
    const completedAt = await store.completeDeletion(uid, bookingCount);
    return { ok: true, completedAt, already: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unbekannt";
    await store.failDeletion(uid, msg).catch(() => {});
    console.error("account deletion step failed", msg.slice(0, 200));
    return { ok: false, kind: "failed" };
  }
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
