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
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB Fehler"));
        transaction.oncomplete = () => db.close();
      }),
  );
}

export async function savePendingDocument(docType: PendingDocType, blob: Blob): Promise<void> {
  await tx("readwrite", (store) => store.put(blob, docType));
}

export async function deletePendingDocument(docType: PendingDocType): Promise<void> {
  await tx("readwrite", (store) => store.delete(docType));
}

export async function listPendingDocumentTypes(): Promise<Set<string>> {
  try {
    const keys = await tx<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
    return new Set(keys.map(String));
  } catch {
    return new Set();
  }
}

export async function clearPendingDocuments(): Promise<void> {
  try {
    await tx("readwrite", (store) => store.clear());
  } catch {
    /* ignore */
  }
}

/**
 * Uploads all locally buffered scans to the signed-in user's account.
 * Successfully uploaded scans are removed from the local buffer, so a retry
 * only re-sends what actually failed.
 */
export async function uploadPendingDocuments(userId: string): Promise<number> {
  let uploaded = 0;
  for (const docType of PENDING_DOC_TYPES) {
    const blob = await tx<Blob | undefined>("readonly", (store) => store.get(docType));
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
