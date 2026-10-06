// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
vi.mock("@/integrations/supabase/client", () => ({ supabase: fake.client }));
const params = { bookingId: "A" };
const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createFileRoute: () => (opts: Record<string, unknown>) => ({ options: opts, useParams: () => ({ ...params }) }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigate,
}));
const requireLogin = vi.fn();
vi.mock("@/lib/login-redirect", () => ({ requireLogin: (...a: unknown[]) => requireLogin(...a) }));
vi.mock("@/lib/native/platform", () => ({ IS_NATIVE_BUILD: false }));
vi.mock("@/components/BrandHomeLink", () => ({ BrandHomeLink: () => <a>logo</a> }));
vi.mock("@/components/PreDriveFlow", () => ({ PreDriveFlow: () => <div>pre</div> }));
vi.mock("@/components/ScheduledTripView", () => ({ ScheduledTripView: () => <div>scheduled</div> }));
vi.mock("@/components/ReturnFlow", () => ({ ReturnFlow: ({ bookingId }: { bookingId: string }) => <div>return-{bookingId}</div> }));
const dashMounts: string[] = [];
vi.mock("@/components/ActiveTripDashboard", async () => {
  const React = await import("react");
  return {
    ActiveTripDashboard: (p: { bookingId: string; userId: string; pickupAddress: string | null; pickupStatus: string }) => {
      React.useState(() => dashMounts.push(`${p.userId}:${p.bookingId}`));
      return (
        <div data-testid="dash">
          dash-{p.userId}-{p.bookingId}-{p.pickupStatus}-{p.pickupAddress ?? "none"}
        </div>
      );
    },
  };
});

import { Route } from "@/routes/trip.$bookingId";
import { Suspense } from "react";
const Inner = (Route as unknown as { options: { component: React.FC } }).options.component;
const TripPage = () => (
  <Suspense fallback={null}>
    <Inner />
  </Suspense>
);

const authCb: Array<(e: string, s: unknown) => void> = [];
let session: unknown = { user: { id: "u1" } };
const row = (id: string, uid = "u1", status = "active") => ({
  id,
  user_id: uid,
  status,
  plan_id: "24h",
  plan_label: "24 Stunden",
  start_date: "2026-10-06",
  start_hour: 0,
  pickup_code: "1234",
  vehicle_name: "Jumper",
  vehicle_plate: `P-${id}`,
  start_km: 100,
});
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => (resolve = r));
  return { p, resolve };
};

beforeEach(() => {
  fake.reset();
  localStorage.clear();
  dashMounts.length = 0;
  authCb.length = 0;
  navigate.mockReset();
  requireLogin.mockReset();
  params.bookingId = "A";
  session = { user: { id: "u1" } };
  Object.assign(fake.client.auth, {
    getSession: vi.fn(async () => ({ data: { session } })),
    onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
      authCb.push(cb);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
  });
  fake.on("vehicles", "select", { data: { pickup_address: "Bestätigte Str. 1, 71229 Leonberg" }, error: null });
});
afterEach(() => cleanup());

describe("Fahrtseite: Isolierung nach Nutzer + Buchung", () => {
  it("A→B Routenwechsel: verspätete Antwort für A überschreibt B nicht", async () => {
    const slowA = deferred<{ data: unknown; error: null }>();
    fake.on("bookings", "select", (s) => {
      const id = s.filters.find((f) => f[0] === "id")?.[1];
      return id === "A" ? slowA.p : { data: row("B"), error: null };
    });
    const { rerender } = render(<TripPage />);
    params.bookingId = "B";
    rerender(<TripPage />);
    await screen.findByText(/dash-u1-B/, undefined, { timeout: 5000 });
    await act(async () => slowA.resolve({ data: row("A"), error: null }));
    expect(screen.queryByText(/dash-u1-A/)).toBeNull();
    expect(screen.getByTestId("dash").textContent).toMatch(/dash-u1-B/);
    expect(dashMounts).toEqual(["u1:B"]);
  });

  it("Logout entfernt die Fahrt sofort und leitet zum Login", async () => {
    fake.on("bookings", "select", { data: row("A"), error: null });
    render(<TripPage />);
    await screen.findByText(/dash-u1-A/);
    act(() => authCb.forEach((cb) => cb("SIGNED_OUT", null)));
    expect(screen.queryByTestId("dash")).toBeNull();
    expect(requireLogin).toHaveBeenCalledWith(navigate, "/trip/A");
  });

  it("Logout vor der getSession-Antwort: veralteter Snapshot lädt keine Fahrt", async () => {
    const slow = deferred<{ data: { session: unknown } }>();
    (fake.client.auth as unknown as { getSession: () => unknown }).getSession = vi.fn(() => slow.p);
    fake.on("bookings", "select", { data: row("A"), error: null });
    render(<TripPage />);
    act(() => authCb.forEach((cb) => cb("SIGNED_IN", { user: { id: "u1" } })));
    act(() => authCb.forEach((cb) => cb("SIGNED_OUT", null)));
    await act(async () => slow.resolve({ data: { session: { user: { id: "u1" } } } }));
    expect(screen.queryByTestId("dash")).toBeNull();
    expect(fake.calls.filter((c) => c.table === "bookings")).toHaveLength(0);
  });

  it("Kontowechsel u1→u2: alter Dashboard-Zustand wird nicht übernommen, Abfrage mit u2", async () => {
    fake.on("bookings", "select", (s) => {
      const uid = s.filters.find((f) => f[0] === "user_id")?.[1] as string;
      return { data: row("A", uid), error: null };
    });
    render(<TripPage />);
    await screen.findByText(/dash-u1-A/);
    session = { user: { id: "u2" } };
    act(() => authCb.forEach((cb) => cb("SIGNED_IN", { user: { id: "u2" } })));
    expect(screen.queryByText(/dash-u1-A/)).toBeNull();
    await screen.findByText(/dash-u2-A/);
    expect(dashMounts).toEqual(["u1:A", "u2:A"]);
    const last = fake.calls.filter((c) => c.table === "bookings").at(-1)!;
    expect(last.filters).toContainEqual(["user_id", "u2"]);
  });

  it("Unmount während Laden: späte Antwort navigiert/rendert nichts", async () => {
    const slow = deferred<{ data: unknown; error: null }>();
    fake.on("bookings", "select", () => slow.p);
    const { unmount } = render(<TripPage />);
    await waitFor(() => expect(fake.calls.some((c) => c.table === "bookings")).toBe(true));
    unmount();
    await act(async () => slow.resolve({ data: row("A", "u1", "completed"), error: null }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("Langsame Verbindung ohne geladene Fahrt: keine Behauptung, die Fahrt laufe weiter", async () => {
    fake.on("bookings", "select", { data: null, error: { message: "timeout" } });
    render(<TripPage />);
    await screen.findByText("Fahrt konnte nicht geladen werden");
    expect(document.body.textContent).not.toMatch(/läuft unverändert weiter/);
  });

  it("Beschädigte Demo-Daten: kein endloses Laden", async () => {
    params.bookingId = "demo-x";
    localStorage.setItem("mt_demo_demo-x", "{kaputt");
    render(<TripPage />);
    await screen.findByText(/Demo-Fahrt auf diesem Gerät ist beschädigt/);
    expect(document.querySelector("[aria-busy=true]")).toBeNull();
  });

  it("Abholort: nur bestätigte Fahrzeugadresse; Lookupfehler wird ehrlich weitergegeben", async () => {
    fake.on("bookings", "select", { data: row("A"), error: null });
    render(<TripPage />);
    await screen.findByText(/dash-u1-A-ok-Bestätigte Str\. 1/);
    cleanup();
    fake.on("vehicles", "select", { data: null, error: { message: "x" } });
    render(<TripPage />);
    await screen.findByText(/dash-u1-A-error-none/);
    expect(document.body.textContent).not.toMatch(/Poststraße|Römerstraße/);
  });
});
