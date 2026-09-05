import { supabase } from "@/integrations/supabase/client";

export const PENDING_DOC_TYPES = [
  "id_front",
  "id_back",
  "license_front",
  "license_back",
] as const;

export type PendingDocType = (typeof PENDING_DOC_TYPES)[number];

const DB_NAME = "mt_pending_documents";
const STORE = "docs";
const DB_VERSION = 1;
const LS_PREFIX = "mt_pending_doc_";
/** ~1.4 MB base64 per document keeps us well below the 5 MB localStorage quota. */
const LS_MAX_CHARS = 1_400_000;

/**
 * Level 1 (authoritative): in-memory. Never fails, survives step changes.
 * Level 2: IndexedDB (ArrayBuffer — older Safari cannot store Blobs).
 * Level 3: localStorage data URL, so a page reload still keeps the scans.
 */
const memory = new Map<string, Blob>();

export type PersistLevel = "memory" | "device";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB nicht verfügbar"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB Fehler"));
    req.onblocked = () => reject(new Error("IndexedDB blockiert"));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let request: IDBRequest<T>;
        try {
          const transaction = db.transaction(STORE, mode);
          request = run(transaction.objectStore(STORE));
          transaction.oncomplete = () => db.close();
          transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB abgebrochen"));
        } catch (e) {
          db.close();
          reject(e instanceof Error ? e : new Error("IndexedDB Fehler"));
          return;
        }
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB Fehler"));
      }),
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Datei konnte nicht gelesen werden"));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [, base64 = ""] = dataUrl.split(",");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const probe = "__mt_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Stores a scan. Never throws: the in-memory copy always succeeds, so the
 * booking flow continues even when the browser refuses persistent storage
 * (Safari private mode, blocked site data, full quota).
 */
export async function savePendingDocument(docType: PendingDocType, blob: Blob): Promise<PersistLevel> {
  memory.set(docType, blob);
  let persisted = false;

  try {
    const buffer = await blob.arrayBuffer();
    await tx("readwrite", (store) => store.put(buffer, docType));
    persisted = true;
  } catch (e) {
    console.warn("[pending-documents] IndexedDB nicht nutzbar", e);
  }

  if (!persisted) {
    const ls = safeLocalStorage();
    if (ls) {
      try {
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl.length <= LS_MAX_CHARS) {
          ls.setItem(LS_PREFIX + docType, dataUrl);
          persisted = true;
        }
      } catch (e) {
        console.warn("[pending-documents] localStorage nicht nutzbar", e);
      }
    }
  }

  return persisted ? "device" : "memory";
}

async function readPendingDocument(docType: PendingDocType): Promise<Blob | null> {
  const inMemory = memory.get(docType);
  if (inMemory) return inMemory;

  try {
    const stored = await tx<ArrayBuffer | Blob | undefined>("readonly", (store) => store.get(docType));
    if (stored) {
      const blob = stored instanceof Blob ? stored : new Blob([stored], { type: "image/jpeg" });
      memory.set(docType, blob);
      return blob;
    }
  } catch {
    /* fall through */
  }

  const ls = safeLocalStorage();
  const dataUrl = ls?.getItem(LS_PREFIX + docType);
  if (dataUrl) {
    try {
      const blob = dataUrlToBlob(dataUrl);
      memory.set(docType, blob);
      return blob;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function deletePendingDocument(docType: PendingDocType): Promise<void> {
  memory.delete(docType);
  try {
    await tx("readwrite", (store) => store.delete(docType));
  } catch {
    /* ignore */
  }
  safeLocalStorage()?.removeItem(LS_PREFIX + docType);
}

/** Union of every source, so the flow reflects what is actually available. */
export async function listPendingDocumentTypes(): Promise<Set<string>> {
  const found = new Set<string>(memory.keys());
  try {
    const keys = await tx<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
    keys.forEach((k) => found.add(String(k)));
  } catch {
    /* ignore */
  }
  const ls = safeLocalStorage();
  if (ls) {
    for (const docType of PENDING_DOC_TYPES) {
      if (ls.getItem(LS_PREFIX + docType)) found.add(docType);
    }
  }
  return found;
}

export async function clearPendingDocuments(): Promise<void> {
  memory.clear();
  try {
    await tx("readwrite", (store) => store.clear());
  } catch {
    /* ignore */
  }
  const ls = safeLocalStorage();
  if (ls) PENDING_DOC_TYPES.forEach((t) => ls.removeItem(LS_PREFIX + t));
}

/**
 * Uploads all buffered scans to the signed-in user's account.
 * Successfully uploaded scans are removed from every buffer, so a retry
 * only re-sends what actually failed.
 */
export async function uploadPendingDocuments(userId: string): Promise<number> {
  let uploaded = 0;
  for (const docType of PENDING_DOC_TYPES) {
    const blob = await readPendingDocument(docType);
    if (!blob) continue;
    const path = `${userId}/${docType}_${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("user-documents")
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (upErr) throw upErr;
    const { error: insErr } = await supabase.from("user_documents").insert({
      user_id: userId,
      doc_type: docType,
      photo_url: path,
      ai_verified: true,
      verified_at: new Date().toISOString(),
    });
    if (insErr) throw insErr;
    await deletePendingDocument(docType);
    uploaded += 1;
  }
  return uploaded;
}
