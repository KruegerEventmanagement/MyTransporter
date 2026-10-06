import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
import { processReturnReminders } from "./return-reminder";
import { resolveTripWindow } from "./trip-time";

const row = { id: "b1", user_id: "u1", status: "picked_up", start_date: "2026-10-08", start_hour: 10, plan_id: "6h", return_reminder_10min_for: null };
const end = resolveTripWindow(row).endMs;

describe("processReturnReminders (minütlicher Job)", () => {
  it("sendet erst nach erfolgreichem Claim mit unverändertem Status/Zeitraum, Ziel /trip/ID", async () => {
    const f = createFakeSupabase();
    f.on("bookings", "select", { data: [row], error: null });
    f.on("bookings", "update", { data: [{ id: "b1" }], error: null });
    const push = vi.fn(async () => ({ sent: 1 }));
    const r = await processReturnReminders({ client: f.client, push, now: () => end - 9 * 60_000, formatEnd: () => "16:00" });
    expect(r).toEqual({ due: 1, claimed: 1, pushed: 1, released: 0 });
    const upd = f.calls.find((c) => c.op === "update")!;
    expect(upd.filters).toEqual(expect.arrayContaining([["status", "picked_up"], ["plan_id", "6h"], ["start_hour", 10]]));
    expect(push).toHaveBeenCalledWith("u1", expect.objectContaining({ url: "/trip/b1" }));
  });
  it("verlorener Claim (Paralleljob, Status/Ende inzwischen geändert) → kein Versand", async () => {
    const f = createFakeSupabase();
    f.on("bookings", "select", { data: [row], error: null });
    f.on("bookings", "update", { data: [], error: null });
    const push = vi.fn(async () => ({ sent: 1 }));
    expect(await processReturnReminders({ client: f.client, push, now: () => end - 5 * 60_000, formatEnd: String })).toMatchObject({ claimed: 0 });
    expect(push).not.toHaveBeenCalled();
  });
  it("11 Minuten vorher noch nicht; returning nie", async () => {
    const f = createFakeSupabase();
    f.on("bookings", "select", { data: [row, { ...row, id: "b2", status: "returning" }], error: null });
    const push = vi.fn(async () => ({ sent: 1 }));
    expect(await processReturnReminders({ client: f.client, push, now: () => end - 11 * 60_000, formatEnd: String })).toMatchObject({ due: 0 });
    expect(push).not.toHaveBeenCalled();
  });
  it("Push-Fehler bzw. 0 Geräte: nur eigener Claim wird freigegeben, späterer Lauf versendet", async () => {
    for (const fail of [async () => { throw new Error("push down"); }, async () => ({ sent: 0 })]) {
      const f = createFakeSupabase();
      f.on("bookings", "select", { data: [row], error: null });
      f.on("bookings", "update", { data: [{ id: "b1" }], error: null });
      const r = await processReturnReminders({ client: f.client, push: vi.fn(fail), now: () => end - 9 * 60_000, formatEnd: String });
      expect(r).toMatchObject({ claimed: 1, pushed: 0, released: 1 });
      const ups = f.calls.filter((c) => c.op === "update");
      expect(ups).toHaveLength(2);
      // Freigabe nur, wenn der Claim noch genau unser Ende trägt
      expect(ups[1]!.values).toEqual({ return_reminder_10min_for: null });
      expect(ups[1]!.filters).toContainEqual(["return_reminder_10min_for", new Date(end).toISOString()]);
      expect(ups[1]!.filters).toEqual(expect.arrayContaining([["id", "b1"], ["status", "picked_up"]]));
    }
    // nächster Minutenlauf: Zeile ist wieder frei → Versand
    const f = createFakeSupabase();
    f.on("bookings", "select", { data: [row], error: null });
    f.on("bookings", "update", { data: [{ id: "b1" }], error: null });
    const push = vi.fn(async () => ({ sent: 1 }));
    expect(await processReturnReminders({ client: f.client, push, now: () => end - 8 * 60_000, formatEnd: String })).toMatchObject({ pushed: 1, released: 0 });
    expect(push).toHaveBeenCalledWith("u1", expect.objectContaining({ tag: "mt-return-b1" }));
  });
  it("Freigabe trifft keinen neueren/parallelen Claim (0 Zeilen) → zählt nicht als freigegeben", async () => {
    const f = createFakeSupabase();
    f.on("bookings", "select", { data: [row], error: null });
    f.on("bookings", "update", { data: [{ id: "b1" }], error: null }, { data: [], error: null });
    const r = await processReturnReminders({ client: f.client, push: vi.fn(async () => ({ sent: 0 })), now: () => end - 9 * 60_000, formatEnd: String });
    expect(r).toMatchObject({ claimed: 1, released: 0 });
  });
  it("bereits erinnertes gleiches Ende wird nicht erneut gesendet", async () => {
    const f = createFakeSupabase();
    f.on("bookings", "select", { data: [{ ...row, return_reminder_10min_for: new Date(end).toISOString() }], error: null });
    const push = vi.fn(async () => ({ sent: 1 }));
    expect(await processReturnReminders({ client: f.client, push, now: () => end - 5 * 60_000, formatEnd: String })).toMatchObject({ due: 0 });
    expect(push).not.toHaveBeenCalled();
  });
});
