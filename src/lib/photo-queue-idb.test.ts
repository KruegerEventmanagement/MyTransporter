// Echte Transaktionssemantik: Anfrage-onsuccess allein ist KEIN Commit.
import { describe, expect, it } from "vitest";
import { openIdbQueueStore, QueueUnavailableError, type QueuedPhoto } from "./photo-queue";

type Mode = "complete" | "abort" | "error";
function fakeFactory(opts: { mode: () => Mode; blocked?: boolean }) {
  const data = new Map<string, unknown>();
  const db = {
    objectStoreNames: { contains: () => true },
    onversionchange: null as null | (() => void),
    close() {},
    transaction(_s: string, mode: string) {
      const staged = new Map(data);
      const deleted = new Set<string>();
      const tx: Record<string, unknown> & { oncomplete?: () => void; onabort?: () => void; onerror?: () => void; error?: unknown } = {};
      const request = <T,>(result: () => T) => {
        const r: { onsuccess?: () => void; onerror?: () => void; result?: T } = {};
        queueMicrotask(() => {
          r.result = result();
          r.onsuccess?.(); // Anfrage meldet Erfolg …
          if (mode !== "readwrite") return;
          queueMicrotask(() => {
            const m = opts.mode(); // … die Transaktion entscheidet erst danach.
            if (m === "complete") {
              staged.forEach((v, k) => data.set(k, v));
              deleted.forEach((k) => data.delete(k));
              tx.oncomplete?.();
            } else if (m === "abort") {
              tx.error = new DOMException("aborted", "AbortError");
              tx.onabort?.();
            } else {
              tx.error = new DOMException("disk", "UnknownError");
              tx.onerror?.();
            }
          });
        });
        return r;
      };
      tx.objectStore = () => ({
        put: (v: { id: string }) => request(() => void staged.set(v.id, v)),
        delete: (id: string) => request(() => void (staged.delete(id), deleted.add(id))),
        get: (id: string) => request(() => data.get(id)),
        getAll: () => request(() => [...data.values()]),
      });
      return tx;
    },
  };
  const factory = {
    open() {
      const r: Record<string, unknown> & { onsuccess?: () => void; onblocked?: () => void } = { result: db };
      queueMicrotask(() => (opts.blocked ? r.onblocked?.() : r.onsuccess?.()));
      return r;
    },
  };
  return { factory: factory as unknown as IDBFactory, data };
}
const item = (id: string): QueuedPhoto => ({
  id, userId: "u1", bookingId: "b1", tag: "post_front", blob: new Blob(["x"]), path: `b1/post_front_${id}.jpg`,
  uploaded: false, createdAt: 1, lastError: null,
});

describe("IndexedDB-Warteschlange (Transaktions-Commit)", () => {
  it("put löst erst nach oncomplete auf und ist danach lesbar", async () => {
    const f = fakeFactory({ mode: () => "complete" });
    const store = (await openIdbQueueStore(f.factory))!;
    await store.put(item("a"));
    expect(f.data.has("a")).toBe(true);
    expect((await store.list("u1", "b1")).map((i) => i.id)).toEqual(["a"]);
  });
  it("Transaktionsabbruch NACH Anfrage-Erfolg: put scheitert, nichts gilt als gespeichert", async () => {
    const f = fakeFactory({ mode: () => "abort" });
    const store = (await openIdbQueueStore(f.factory))!;
    await expect(store.put(item("a"))).rejects.toBeInstanceOf(QueueUnavailableError);
    expect(f.data.size).toBe(0);
  });
  it("Transaktionsfehler: put scheitert", async () => {
    const f = fakeFactory({ mode: () => "error" });
    const store = (await openIdbQueueStore(f.factory))!;
    await expect(store.put(item("a"))).rejects.toBeInstanceOf(QueueUnavailableError);
  });
  it("remove wartet auf Commit; Abbruch lässt Eintrag bestehen", async () => {
    let m: Mode = "complete";
    const f = fakeFactory({ mode: () => m });
    const store = (await openIdbQueueStore(f.factory))!;
    await store.put(item("a"));
    m = "abort";
    await expect(store.remove("a")).rejects.toBeTruthy();
    expect(f.data.has("a")).toBe(true);
    m = "complete";
    await store.remove("a");
    expect(f.data.has("a")).toBe(false);
  });
  it("blockiertes Öffnen (anderer Tab): kein Store, ehrlicher Online-Fallback", async () => {
    const f = fakeFactory({ mode: () => "complete", blocked: true });
    expect(await openIdbQueueStore(f.factory)).toBeNull();
  });
});
