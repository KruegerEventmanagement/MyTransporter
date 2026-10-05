import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
import { enqueuePhoto, memoryQueueStore, transferQueuedPhoto } from "./photo-queue";

const blob = () => new Blob([new Uint8Array([0xff, 0xd8, 1])], { type: "image/jpeg" });

describe("Foto-Warteschlange", () => {
  it("offline → bleibt gespeichert; Reconnect überträgt mit identischem Pfad", async () => {
    const f = createFakeSupabase();
    const store = memoryQueueStore();
    const item = await enqueuePhoto(store, { userId: "u1", bookingId: "b1", tag: "post_front", blob: blob() });
    f.storage.upload = [{ error: "throw" }, { error: null }];
    f.on("trip_photos", "insert", { data: { id: "p" }, error: null });
    await expect(transferQueuedPhoto(f.client, store, item.id)).rejects.toThrow(/nicht hochgeladen/);
    expect((await store.list("u1", "b1"))[0]?.lastError).toBeTruthy();
    const saved = await transferQueuedPhoto(f.client, store, item.id);
    expect(saved.path).toBe(item.path);
    const paths = f.storageCalls.filter((c) => c.op === "upload").map((c) => c.path);
    expect(paths).toEqual([item.path, item.path]);
    expect(await store.list("u1", "b1")).toHaveLength(0);
  });
  it("DB-Fehler nach Upload: Retry lädt nicht erneut hoch", async () => {
    const f = createFakeSupabase();
    const store = memoryQueueStore();
    const item = await enqueuePhoto(store, { userId: "u1", bookingId: "b1", tag: "post_fuel", blob: blob() });
    f.on("trip_photos", "insert", { data: null, error: { message: "x" } }, { data: { id: "p" }, error: null });
    await expect(transferQueuedPhoto(f.client, store, item.id)).rejects.toThrow();
    expect((await store.get(item.id))?.uploaded).toBe(true);
    await transferQueuedPhoto(f.client, store, item.id);
    expect(f.storageCalls.filter((c) => c.op === "upload")).toHaveLength(1);
  });
  it("verlorene Upload-Antwort: 'existiert bereits' am stabilen Pfad gilt als hochgeladen", async () => {
    const f = createFakeSupabase();
    const store = memoryQueueStore();
    const item = await enqueuePhoto(store, { userId: "u1", bookingId: "b1", tag: "post_back", blob: blob() });
    f.storage.upload = [{ error: { message: "The resource already exists" } }];
    f.on("trip_photos", "insert", { data: { id: "p" }, error: null });
    await expect(transferQueuedPhoto(f.client, store, item.id)).resolves.toMatchObject({ path: item.path });
  });
  it("mehrfacher Aufruf (Remount/online/Doppelklick) überträgt nur einmal", async () => {
    const f = createFakeSupabase();
    const store = memoryQueueStore();
    const item = await enqueuePhoto(store, { userId: "u1", bookingId: "b1", tag: "post_left", blob: blob() });
    f.on("trip_photos", "insert", { data: { id: "p" }, error: null });
    await Promise.all([transferQueuedPhoto(f.client, store, item.id), transferQueuedPhoto(f.client, store, item.id)]);
    expect(f.storageCalls.filter((c) => c.op === "upload")).toHaveLength(1);
    expect(f.calls.filter((c) => c.table === "trip_photos" && c.op === "insert")).toHaveLength(1);
  });
  it("Warteschlange ist nach Nutzer und Buchung getrennt", async () => {
    const store = memoryQueueStore();
    await enqueuePhoto(store, { userId: "u1", bookingId: "b1", tag: "post_front", blob: blob() });
    await enqueuePhoto(store, { userId: "u2", bookingId: "b1", tag: "post_front", blob: blob() });
    expect(await store.list("u1", "b1")).toHaveLength(1);
    expect(await store.list("u1", "b2")).toHaveLength(0);
  });
});
