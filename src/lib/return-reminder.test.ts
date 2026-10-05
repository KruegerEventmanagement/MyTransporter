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
    expect(r).toEqual({ due: 1, claimed: 1, pushed: 1 });
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
});
