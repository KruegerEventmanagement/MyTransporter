/**
 * Entfernt nach Kontolöschung nur die eigenen MyTransporter-Daten dieses Geräts.
 * Namen stammen aus dem Code (pending-documents.ts, photo-queue.ts, return-draft.ts,
 * BookingSection, login-redirect); fremde Seiten/Browserdaten bleiben unberührt.
 */
export const ACCOUNT_IDB_NAMES = ["mt_pending_documents", "mt-photo-queue"] as const;
/** Präfixe für persönliche Einträge; Einwilligung (mt_consent_v1) bleibt bewusst erhalten. */
export const ACCOUNT_STORAGE_PREFIXES = [
  "mt_pending_doc_",
  "mt_return_draft_v",
  "mt_trip_nav_v",
  "mt_auth_booking_draft",
  "mt_booking_draft",
  "mt_pending_booking",
  "mt_login_redirect",
  "mt_open_login",
  "mt_resend_last_sent",
  "mt_demo_",
] as const;

export function authStorageKey(projectId: string | undefined): string | null {
  return projectId ? `sb-${projectId}-auth-token` : null;
}

export function clearAccountStorage(stores: Storage[], authKey: string | null): string[] {
  const removed: string[] = [];
  for (const s of stores) {
    for (const k of Object.keys(s)) {
      if (ACCOUNT_STORAGE_PREFIXES.some((p) => k.startsWith(p)) || (authKey && (k === authKey || k.startsWith(`${authKey}-`)))) {
        s.removeItem(k);
        removed.push(k);
      }
    }
  }
  return removed;
}

export function deleteIdb(factory: IDBFactory | undefined, name: string, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!factory) return resolve(false);
    let done = false;
    const finish = (v: boolean) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    try {
      const req = factory.deleteDatabase(name);
      req.onsuccess = () => finish(true);
      req.onerror = () => finish(false);
      req.onblocked = () => setTimeout(() => finish(false), timeoutMs);
    } catch {
      finish(false);
    }
    setTimeout(() => finish(false), timeoutMs);
  });
}

export async function clearLocalAccountData(opts: {
  signOut: () => Promise<unknown>;
  clearQueries: () => void;
  disablePush?: () => Promise<void>;
  projectId?: string;
}): Promise<void> {
  try {
    await opts.disablePush?.();
  } catch {
    /* Push evtl. nicht unterstützt */
  }
  try {
    const { clearPendingDocuments } = await import("@/lib/pending-documents");
    await clearPendingDocuments();
  } catch {
    /* ignore */
  }
  const idb = typeof indexedDB === "undefined" ? undefined : indexedDB;
  await Promise.all(ACCOUNT_IDB_NAMES.map((n) => deleteIdb(idb, n)));
  try {
    clearAccountStorage([localStorage, sessionStorage], null);
  } catch {
    /* Speicher blockiert */
  }
  await opts.signOut().catch(() => {});
  try {
    clearAccountStorage([localStorage, sessionStorage], authStorageKey(opts.projectId));
  } catch {
    /* ignore */
  }
  opts.clearQueries();
}
