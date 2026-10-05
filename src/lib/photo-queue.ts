/**
 * Warteschlange für noch nicht übertragene Rückgabefotos.
 * Blobs liegen in IndexedDB (nie Base64 in localStorage). Jede Aufnahme hat
 * eine stabile ID und einen stabilen Storagepfad; ein Retry nach verlorener
 * Antwort verwendet denselben Pfad. "Übertragen" erst nach Upload UND DB.
 */
import { saveTripPhoto, TripPhotoError, type StoredTripPhoto, type TripPhotoClient } from "./trip-photo-store";

export interface QueuedPhoto {
  id: string;
  userId: string;
  bookingId: string;
  tag: string;
  blob: Blob;
  /** Stabiler KANDIDATEN-Pfad im Bucket (noch kein Beweis für einen Upload). */
  path: string;
  /** true erst, wenn der Upload bestätigt ist (Retry trägt dann nur die DB-Zeile nach). */
  uploaded: boolean;
  /** Tatsächlich bestätigter Upload-Pfad; null solange nur Kandidat. */
  uploadedPath?: string | null;
  createdAt: number;
  lastError: string | null;
}

export interface QueueStore {
  put(item: QueuedPhoto): Promise<void>;
  get(id: string): Promise<QueuedPhoto | undefined>;
  list(userId: string, bookingId: string): Promise<QueuedPhoto[]>;
  remove(id: string): Promise<void>;
}

export class QueueUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueUnavailableError";
  }
}

export function memoryQueueStore(): QueueStore & { items: Map<string, QueuedPhoto> } {
  const items = new Map<string, QueuedPhoto>();
  return {
    items,
    async put(i) {
      items.set(i.id, { ...i });
    },
    async get(id) {
      const v = items.get(id);
      return v ? { ...v } : undefined;
    },
    async list(u, b) {
      return [...items.values()].filter((i) => i.userId === u && i.bookingId === b).sort((a, c) => a.createdAt - c.createdAt);
    },
    async remove(id) {
      items.delete(id);
    },
  };
}

const DB = "mt-photo-queue";
const STORE = "items";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

/** IndexedDB-Store oder null, wenn auf diesem Gerät nicht verfügbar. */
export async function openIdbQueueStore(): Promise<QueueStore | null> {
  if (typeof indexedDB === "undefined") return null;
  let db: IDBDatabase;
  try {
    db = await new Promise<IDBDatabase>((res, rej) => {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE, { keyPath: "id" });
      };
      open.onsuccess = () => res(open.result);
      open.onerror = () => rej(open.error);
      open.onblocked = () => rej(new Error("blocked"));
    });
  } catch {
    return null;
  }
  const tx = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);
  return {
    async put(i) {
      try {
        await req(tx("readwrite").put(i));
      } catch (e) {
        const quota = (e as DOMException)?.name === "QuotaExceededError";
        throw new QueueUnavailableError(
          quota
            ? "Der Gerätespeicher ist voll. Das Foto wird direkt online übertragen."
            : "Fotos können auf diesem Gerät nicht zwischengespeichert werden. Das Foto wird direkt online übertragen.",
        );
      }
    },
    async get(id) {
      return (await req(tx("readonly").get(id))) as QueuedPhoto | undefined;
    },
    async list(u, b) {
      const all = (await req(tx("readonly").getAll())) as QueuedPhoto[];
      return all.filter((i) => i.userId === u && i.bookingId === b).sort((a, c) => a.createdAt - c.createdAt);
    },
    async remove(id) {
      await req(tx("readwrite").delete(id));
    },
  };
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export async function enqueuePhoto(
  store: QueueStore,
  args: { userId: string; bookingId: string; tag: string; blob: Blob },
): Promise<QueuedPhoto> {
  const id = newId();
  const item: QueuedPhoto = {
    id,
    userId: args.userId,
    bookingId: args.bookingId,
    tag: args.tag,
    blob: args.blob,
    path: `${args.bookingId}/${args.tag}_${id}.jpg`,
    uploaded: false,
    createdAt: Date.now(),
    lastError: null,
  };
  await store.put(item);
  return item;
}

// Pro Tab: dieselbe Aufnahme wird nie parallel übertragen (Remount, Doppelklick, online-Event).
const inFlight = new Map<string, Promise<StoredTripPhoto>>();

export function transferQueuedPhoto(client: TripPhotoClient, store: QueueStore, id: string): Promise<StoredTripPhoto> {
  const running = inFlight.get(id);
  if (running) return running;
  const p = (async () => {
    const item = await store.get(id);
    if (!item) throw new Error("Aufnahme nicht mehr vorhanden.");
    try {
      const saved = await saveTripPhoto(client, {
        bookingId: item.bookingId,
        tag: item.tag,
        file: item.blob,
        uploadedPath: item.uploaded ? (item.uploadedPath ?? item.path) : null,
        path: item.path,
      });
      await store.remove(id);
      return saved;
    } catch (e) {
      const uploaded = item.uploaded || (e instanceof TripPhotoError && e.uploadedPath === item.path);
      await store.put({ ...item, uploaded, uploadedPath: uploaded ? item.path : null, lastError: e instanceof Error ? e.message : "Übertragung fehlgeschlagen." }).catch(() => {});
      throw e;
    }
  })();
  inFlight.set(id, p);
  p.then(
    () => inFlight.delete(id),
    () => inFlight.delete(id),
  );
  return p;
}
