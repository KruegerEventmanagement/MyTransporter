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

/** IndexedDB-Datensatz: Bytes statt Blob (ältere Einträge können noch einen Blob enthalten). */
type StoredRecord = Omit<QueuedPhoto, "blob"> & { blob?: Blob; bytes?: ArrayBuffer; type?: string };

async function toBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Response(blob).arrayBuffer();
}

function fromRecord(r: StoredRecord): QueuedPhoto {
  const { bytes, type, blob, ...rest } = r;
  const out = bytes ? new Blob([bytes], { type: type || "image/jpeg" }) : (blob ?? new Blob([], { type: "image/jpeg" }));
  return { ...rest, blob: out };
}
const STORE = "items";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

/**
 * Schreibvorgang gilt erst nach transaction.oncomplete als dauerhaft gesichert.
 * onsuccess einer Anfrage reicht nicht: die Transaktion kann danach noch abbrechen.
 */
function commit(db: IDBDatabase, run: (s: IDBObjectStore) => void): Promise<void> {
  return new Promise((res, rej) => {
    let t: IDBTransaction;
    try {
      t = db.transaction(STORE, "readwrite");
      run(t.objectStore(STORE));
    } catch (e) {
      rej(e);
      return;
    }
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error ?? new Error("IndexedDB-Fehler"));
    t.onabort = () => rej(t.error ?? new DOMException("Transaktion abgebrochen", "AbortError"));
  });
}

/** IndexedDB-Store oder null, wenn auf diesem Gerät nicht verfügbar bzw. durch anderen Tab blockiert. */
export async function openIdbQueueStore(factory: IDBFactory | undefined = typeof indexedDB === "undefined" ? undefined : indexedDB): Promise<QueueStore | null> {
  if (!factory) return null;
  let db: IDBDatabase;
  try {
    db = await new Promise<IDBDatabase>((res, rej) => {
      const open = factory.open(DB, 1);
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
  // Ein anderer Tab braucht eine neue Version: Verbindung freigeben statt ihn zu blockieren.
  db.onversionchange = () => db.close();
  const read = () => db.transaction(STORE, "readonly").objectStore(STORE);
  return {
    async put(i) {
      // iOS/Safari: in IndexedDB gespeicherte Blobs sind nach dem Auslesen oft nicht mehr
      // lesbar (Upload schlägt dann still fehl). Darum nur rohe Bytes speichern.
      let bytes: ArrayBuffer;
      try {
        bytes = await toBytes(i.blob);
      } catch {
        throw new QueueUnavailableError("Fotos können auf diesem Gerät nicht zwischengespeichert werden. Das Foto wird direkt online übertragen.");
      }
      const { blob: _blob, ...rest } = i;
      void _blob;
      const record: StoredRecord = { ...rest, bytes, type: i.blob.type || "image/jpeg" };
      try {
        await commit(db, (st) => st.put(record));
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
      const r = (await req(read().get(id))) as StoredRecord | undefined;
      return r ? fromRecord(r) : undefined;
    },
    async list(u, b) {
      const all = ((await req(read().getAll())) as StoredRecord[]).map(fromRecord);
      return all.filter((i) => i.userId === u && i.bookingId === b).sort((a, c) => a.createdAt - c.createdAt);
    },
    async remove(id) {
      await commit(db, (st) => st.delete(id));
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

export class PhotoUnreadableError extends Error {
  constructor() {
    super("Dieses Foto ist auf dem Gerät nicht mehr lesbar. Bitte über „Neu aufnehmen“ erneut fotografieren oder aus der Galerie wählen.");
    this.name = "PhotoUnreadableError";
  }
}

/** Frische, sicher lesbare Kopie (Safari liefert aus IndexedDB teils kaputte Blob-Referenzen). */
async function readableCopy(blob: Blob): Promise<Blob> {
  let bytes: ArrayBuffer;
  try {
    bytes = await toBytes(blob);
  } catch {
    throw new PhotoUnreadableError();
  }
  if (!bytes.byteLength) throw new PhotoUnreadableError();
  return new Blob([bytes], { type: blob.type || "image/jpeg" });
}

/**
 * @param fresh optional die gerade aufgenommene Datei aus dem Arbeitsspeicher –
 *   wird bevorzugt hochgeladen, damit ein Gerätespeicher-Problem den Upload nie blockiert.
 */
export function transferQueuedPhoto(client: TripPhotoClient, store: QueueStore, id: string, fresh?: Blob): Promise<StoredTripPhoto> {
  const running = inFlight.get(id);
  if (running) return running;
  const p = (async () => {
    const item = await store.get(id);
    if (!item) throw new Error("Aufnahme nicht mehr vorhanden.");
    try {
      const file = item.uploaded ? item.blob : await readableCopy(fresh ?? item.blob);
      const saved = await saveTripPhoto(client, {
        bookingId: item.bookingId,
        tag: item.tag,
        file,
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
