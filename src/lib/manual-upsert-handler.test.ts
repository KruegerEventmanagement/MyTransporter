import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("@/lib/active-account", () => ({ requireActiveAccount: {} }));
vi.mock("@/lib/manual-notifications.server", () => ({ kickManualNotificationOutbox: vi.fn() }));
vi.mock("@/lib/calendar-sync.server", () => ({ kickCalendarSync: vi.fn() }));
const { run } = vi.hoisted(() => ({ run: vi.fn(async (_d: unknown, t: { revision: number }) => ({ status: "failed", kind: "invalid_key", error: "x", ambiguous: false, revision: t.revision })) }));
vi.mock("@/lib/manual-confirmation.server", () => ({ runCustomerConfirmation: run, createConfirmationDeps: async () => ({}) }));

import { performManualUpsert, type UpsertInput } from "@/lib/manual-reservations.functions";

type Row = Record<string, unknown>;
function fakeSupabase(opts: { admin?: boolean } = {}) {
  const rows: Row[] = [];
  const api = {
    rows,
    rpc: async () => ({ data: opts.admin !== false, error: null }),
    from: () => ({
      insert: (p: Row) => ({
        select: () => ({
          single: async () => {
            if (rows.some((r) => r.create_request_id && r.create_request_id === p.create_request_id))
              return { data: null, error: { code: "23505", message: "dup" } };
            const row = { ...p, id: "a0000000-0000-4000-8000-000000000001", revision: 1 };
            rows.push(row);
            return { data: row, error: null };
          },
        }),
      }),
      select: () => ({
        eq: (_c: string, v: unknown) => ({
          maybeSingle: async () => ({ data: rows.find((r) => r.create_request_id === v || r.id === v) ?? null, error: null }),
        }),
      }),
    }),
  };
  return api;
}
const call = (a: { data: unknown; context: { supabase: unknown; userId: string } }) =>
  performManualUpsert({ reminderEnabled: true, notifyCustomer: false, sendConfirmation: false, ...(a.data as object) } as UpsertInput, a.context) as unknown as Promise<{
  reservation: Row; deduplicated: boolean; confirmation: { status: string } | null;
}>;
const input = {
  vehiclePlate: "LEO MY 102", startAt: "2026-10-11T07:00:00.000Z", endAt: "2026-10-11T16:00:00.000Z",
  customerName: "Test", customerEmail: "a@b.de", totalPriceCents: 12900, sendConfirmation: true,
  createRequestId: "b0000000-0000-4000-8000-000000000002",
};

describe("upsertManualReservation", () => {
  beforeEach(() => run.mockClear());
  it("verweigert Nicht-Admins", async () => {
    await expect(call({ data: input, context: { supabase: fakeSupabase({ admin: false }), userId: "u" } })).rejects.toThrow(/Forbidden/);
  });
  it("Pflichtprüfungen serverseitig (Preis/E-Mail)", async () => {
    const ctx = { supabase: fakeSupabase(), userId: "u" };
    await expect(call({ data: { ...input, totalPriceCents: null }, context: ctx })).rejects.toThrow(/Gesamtmietpreis/);
    await expect(call({ data: { ...input, customerEmail: null }, context: ctx })).rejects.toThrow(/E-Mail/);
  });
  it("Sendeabsicht wird im Save persistiert, Versand serverseitig; Mailfehler ≠ Speicherfehler", async () => {
    const sb = fakeSupabase();
    const r = await call({ data: input, context: { supabase: sb, userId: "u" } });
    expect(sb.rows[0].confirmation_requested).toBe(true);
    expect(r.reservation.id).toBeTruthy();
    expect(r.confirmation?.status).toBe("failed");
    expect(run).toHaveBeenCalledWith({}, { reservationId: r.reservation.id, revision: 1 });
  });
  it("Retry nach verlorener Antwort legt nicht doppelt an", async () => {
    const sb = fakeSupabase();
    const ctx = { supabase: sb, userId: "u" };
    await call({ data: input, context: ctx });
    const again = await call({ data: input, context: ctx });
    expect(sb.rows).toHaveLength(1);
    expect(again.deduplicated).toBe(true);
    expect(run).toHaveBeenLastCalledWith({}, { reservationId: sb.rows[0].id, revision: 1 });
  });
});
