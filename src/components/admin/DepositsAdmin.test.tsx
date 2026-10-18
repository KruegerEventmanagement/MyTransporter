// @vitest-environment jsdom
// DepositsAdmin: kein Hook-Fehler beim ersten Laden, kein Übermalen durch verspätete Antworten (Kunde A → B).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const ctxFor = (name: string) => ({
  source: "booking", id: A, customerName: name, firstName: name, email: `${name}@x.de`, userId: null,
  bookingRef: "MT-1", vehicle: "Fiat · LEO 1", startMs: 0, endMs: 1, returnReportedMs: null,
  priceLine: "99,00 €", status: "completed", depositCents: 20000, depositLine: "200,00 € · Status held",
  stripe: null, depositStatus: "held", facts: {}, checklist: null, photos: [], issues: [],
  docFee: { allowed: false, why: "" }, extraKm: { km: null, cents: null, alreadyPaid: false },
  review: null, settlements: [], closingMail: null, knownBounce: false,
});

const calls: string[] = [];
let resolvers: ((v: unknown) => void)[] = [];
const getDepositReviewFn = vi.fn(({ data }: { data: { id: string } }) => {
  calls.push(data.id);
  return new Promise((res) => resolvers.push(res));
});

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/deposit-review.functions", () => ({
  listOpenDepositsFn: vi.fn(async () => []),
  getDepositReviewFn,
  saveDepositDraftFn: vi.fn(), previewDepositMailFn: vi.fn(), recordManualDepositFn: vi.fn(),
  finalizeDepositFn: vi.fn(), continueDepositFn: vi.fn(), refreshDepositFn: vi.fn(), confirmManualPayoutFn: vi.fn(),
}));
vi.mock("@/lib/calendar-details.functions", () => ({ getCalendarEntryDetails: vi.fn(async () => null) }));
vi.mock("@/lib/trip-photos", () => ({ resolveTripPhotoUrl: vi.fn(async (u: string) => u) }));

const { DepositsAdmin } = await import("@/components/admin/DepositsAdmin");

afterEach(() => {
  cleanup();
  calls.length = 0;
  resolvers = [];
  getDepositReviewFn.mockClear();
});

describe("DepositsAdmin", () => {
  it("lädt ohne Hook-Fehler: erst Ladezustand, dann Inhalt", async () => {
    render(<DepositsAdmin initial={{ source: "booking", id: A }} />);
    expect(screen.getByText("Lädt …")).toBeTruthy();
    resolvers.forEach((r) => r(ctxFor("Anna")));
    await waitFor(() => expect(screen.getByText("Anna")).toBeTruthy());
    expect(screen.getByText("Kaution")).toBeTruthy();
  });

  it("Kundenwechsel A → B: verspätete Antwort von A übermalt B nicht", async () => {
    const { rerender } = render(<DepositsAdmin initial={{ source: "booking", id: A }} />);
    // Wechsel zu B, bevor A antwortet
    rerender(<DepositsAdmin initial={{ source: "booking", id: B }} />);
    await waitFor(() => expect(calls).toContain(B));
    // B antwortet zuerst, A erst danach (veraltet)
    resolvers[1]?.(ctxFor("Berta"));
    await waitFor(() => expect(screen.getByText("Berta")).toBeTruthy());
    resolvers[0]?.(ctxFor("Anna"));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Anna")).toBeNull();
    expect(screen.getByText("Berta")).toBeTruthy();
  });
});
