// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
vi.mock("@/integrations/supabase/client", () => ({ supabase: fake.client }));
let pathname = "/preise";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...rest }: { children: React.ReactNode; to: string; params?: { bookingId?: string } }) => (
    <a href={params?.bookingId ? to.replace("$bookingId", params.bookingId) : to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) => select({ location: { pathname } }),
}));
let resolveMaps: () => void = () => {};
const mapCtor = vi.fn();
vi.mock("@googlemaps/js-api-loader", () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn(
    () =>
      new Promise<void>((r) => {
        const prev = resolveMaps;
        resolveMaps = () => {
          prev();
          r();
        };
      }),
  ),
}));
vi.mock("@/lib/push-client", () => ({
  getPushStatus: vi.fn(async () => "default"),
  isSubscribedOnThisDevice: vi.fn(async () => false),
  enablePushOnThisDevice: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/assets/logo.png", () => ({ default: "/logo.png" }));

import { ActiveTripBanner } from "./ActiveTripBanner";
import { ActiveTripDashboard } from "./ActiveTripDashboard";
import { enablePushOnThisDevice } from "@/lib/push-client";

const authCb: Array<(e: string, s: unknown) => void> = [];
beforeEach(() => {
  resolveMaps = () => {};
  fake.reset();
  localStorage.clear();
  pathname = "/preise";
  authCb.length = 0;
  Object.assign(fake.client.auth, {
    getSession: vi.fn(async () => ({ data: { session: { user: { id: "u1" } } } })),
    onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
      authCb.push(cb);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
  });
  (globalThis as unknown as { google: unknown }).google = { maps: { Map: mapCtor } };
});
afterEach(() => cleanup());

const activeRow = { id: "b1", user_id: "u1", status: "active", start_date: "2026-10-08", start_hour: 10, plan_id: "24h" };

describe("Globale Leiste 'Sofort zurückkehren'", () => {
  it("erscheint außerhalb der Fahrt und führt exakt zur laufenden Fahrt", async () => {
    fake.on("bookings", "select", { data: [activeRow], error: null });
    render(<ActiveTripBanner />);
    const link = await screen.findByText("Sofort zurückkehren");
    expect(link.closest("a")!.getAttribute("href")).toBe("/trip/b1");
    const q = fake.calls.find((c) => c.table === "bookings")!;
    expect(q.filters).toContainEqual(["user_id", "u1"]);
  });
  it("nicht in der Fahrtansicht; verschwindet bei Abmeldung und zeigt nie Fremddaten", async () => {
    fake.on("bookings", "select", { data: [{ ...activeRow, user_id: "fremd" }], error: null });
    render(<ActiveTripBanner />);
    await waitFor(() => expect(fake.calls.length).toBeGreaterThan(0));
    expect(screen.queryByText("Sofort zurückkehren")).toBeNull();
    cleanup();
    pathname = "/trip/b1";
    fake.on("bookings", "select", { data: [activeRow], error: null });
    render(<ActiveTripBanner />);
    await waitFor(() => expect(fake.calls.length).toBeGreaterThan(1));
    expect(screen.queryByText("Sofort zurückkehren")).toBeNull();
    cleanup();
    pathname = "/";
    render(<ActiveTripBanner />);
    await screen.findByText("Sofort zurückkehren");
    act(() => authCb.forEach((cb) => cb("SIGNED_OUT", null)));
    await waitFor(() => expect(screen.queryByText("Sofort zurückkehren")).toBeNull());
  });
  it("Netzfehler beim Revalidieren behält den aktiven Stand", async () => {
    fake.on("bookings", "select", { data: [activeRow], error: null }, { data: null, error: { message: "offline" } });
    render(<ActiveTripBanner />);
    await screen.findByText("Sofort zurückkehren");
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(fake.calls.filter((c) => c.table === "bookings").length).toBe(2));
    expect(screen.getByText("Sofort zurückkehren")).toBeTruthy();
  });
  it("beendete Miete entfernt die Leiste", async () => {
    fake.on("bookings", "select", { data: [activeRow], error: null }, { data: [], error: null });
    render(<ActiveTripBanner />);
    await screen.findByText("Sofort zurückkehren");
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(screen.queryByText("Sofort zurückkehren")).toBeNull());
  });
});

const dash = (over: Partial<React.ComponentProps<typeof ActiveTripDashboard>> = {}) => (
  <ActiveTripDashboard
    bookingId="b1"
    userId="u1"
    startAtMs={Date.now() - 3600_000}
    endAtMs={Date.now() + 5 * 60_000}
    startKm={0}
    vehicleName="Citroën Jumper"
    vehiclePlate="LEO MY 101"
    planLabel="24 Stunden"
    onReturn={vi.fn()}
    {...over}
  />
);

describe("Leiste oben + Auth-Reihenfolge", () => {
  it("Leiste sitzt oben mit Safe Area und setzt den Versatz für Navigation", async () => {
    fake.on("bookings", "select", { data: [activeRow], error: null });
    render(<ActiveTripBanner />);
    const bar = await screen.findByTestId("active-trip-banner");
    expect(bar.className).toMatch(/top-0/);
    expect(bar.className).not.toMatch(/bottom-0/);
    expect(document.documentElement.style.getPropertyValue("--mt-trip-bar")).toMatch(/44px/);
    cleanup();
    expect(document.documentElement.style.getPropertyValue("--mt-trip-bar")).toBe("");
  });
  it("Abmeldung vor der getSession-Antwort: alter Snapshot zeigt keine Leiste", async () => {
    let resolve!: (v: unknown) => void;
    (fake.client.auth as unknown as { getSession: unknown }).getSession = vi.fn(() => new Promise((r) => (resolve = r)));
    fake.on("bookings", "select", { data: [activeRow], error: null });
    render(<ActiveTripBanner />);
    act(() => authCb.forEach((cb) => cb("SIGNED_OUT", null)));
    await act(async () => resolve({ data: { session: { user: { id: "u1" } } } }));
    expect(screen.queryByTestId("active-trip-banner")).toBeNull();
    expect(fake.calls.filter((c) => c.table === "bookings")).toHaveLength(0);
  });
});

describe("Fahrtansicht", () => {
  it("'Nicht jetzt' startet keine Standortabfrage und fragt nach Reload nicht erneut", async () => {
    const watch = vi.fn();
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { watchPosition: watch, getCurrentPosition: vi.fn(), clearWatch: vi.fn() } });
    render(dash());
    fireEvent.click(screen.getByText("Nicht jetzt"));
    expect(watch).not.toHaveBeenCalled();
    cleanup();
    render(dash());
    expect(screen.queryByText("Nicht jetzt")).toBeNull();
    expect(watch).not.toHaveBeenCalled();
    expect(screen.getByText("Standort jetzt verwenden")).toBeTruthy();
  });
  it("verzögerte Karteninitialisierung nach Unmount erzeugt keine Karte", async () => {
    render(dash());
    cleanup();
    await act(async () => resolveMaps());
    expect(mapCtor).not.toHaveBeenCalled();
  });
  it("Logo führt zur Startseite; 10-Minuten-Hinweis + Rückgabe-Ende aus Buchung; Checkliste", () => {
    const end = Date.now() + 5 * 60_000;
    render(dash({ endAtMs: end, addons: [{ id: "sackkarre", label: "Sackkarre" }] }));
    expect(screen.getByLabelText("MyTransporter Startseite").getAttribute("href")).toBe("/");
    expect(screen.getByTestId("return-reminder").textContent).toMatch(/Sobald du sicher geparkt hast/);
    fireEvent.click(screen.getByText("Rückgabe-Checkliste"));
    const list = screen.getByTestId("return-checklist").textContent!;
    expect(list).toMatch(/8 Außenfotos/);
    expect(list).toMatch(/Tankstand/);
    expect(list).toMatch(/Sackkarre/);
  });
  it("verspätet: Hinweis bleibt, Rückgabe weiter möglich", () => {
    const onReturn = vi.fn();
    render(dash({ endAtMs: Date.now() - 60_000, onReturn }));
    expect(screen.getByTestId("return-reminder").textContent).toMatch(/überschritten/);
    fireEvent.click(screen.getByText("Rückgabe starten"));
    fireEvent.click(screen.getByText("Ja, Rückgabe starten"));
    expect(onReturn).toHaveBeenCalled();
  });
  it("Push nur nach Klick", async () => {
    render(dash());
    const btn = await screen.findByText(/Rückgabe-Erinnerung aufs Gerät/);
    expect(enablePushOnThisDevice).not.toHaveBeenCalled();
    fireEvent.click(btn);
    await waitFor(() => expect(enablePushOnThisDevice).toHaveBeenCalledTimes(1));
  });
  it("ohne bestätigten Abholort: kein Ersatzort, ehrlicher Hinweis, Rückgabe bedienbar", async () => {
    const g = installMapsMock();
    for (const [status, text] of [
      ["missing", /kein Abholort hinterlegt/],
      ["error", /konnte gerade nicht geladen werden/],
      ["loading", /Abholort wird geladen/],
    ] as const) {
      render(dash({ pickupAddress: null, pickupStatus: status }));
      await act(async () => resolveMaps());
      expect(screen.getByTestId("pickup-hint").textContent).toMatch(text);
      expect(screen.getByText("Rückgabe starten")).toBeTruthy();
      cleanup();
    }
    expect(g.geocodes.map((x) => x.address)).toEqual([]);
    expect(document.body.textContent).not.toMatch(/Poststraße|Römerstraße/);
  });
  it("bestätigter Abholort wird genau so geocodiert", async () => {
    const g = installMapsMock();
    render(dash({ pickupAddress: "Fahrzeugstr. 5, Leonberg", pickupStatus: "ok" }));
    await act(async () => resolveMaps());
    await waitFor(() => expect(g.geocodes.map((x) => x.address)).toEqual(["Fahrzeugstr. 5, Leonberg"]));
    expect(screen.queryByTestId("pickup-hint")).toBeNull();
  });
  it("verspätete Geocoder-Antwort einer älteren Suche wird verworfen", async () => {
    const g = installMapsMock();
    render(dash({ pickupAddress: null, pickupStatus: "missing" }));
    await act(async () => resolveMaps());
    const input = screen.getByPlaceholderText("Zieladresse eingeben...");
    fireEvent.change(input, { target: { value: "Alt" } });
    fireEvent.submit(input.closest("form")!);
    fireEvent.change(input, { target: { value: "Neu" } });
    fireEvent.submit(input.closest("form")!);
    act(() => g.answer("Neu", "Neu-Adresse"));
    act(() => g.answer("Alt", "Alt-Adresse"));
    expect(document.body.textContent).toMatch(/Neu-Adresse/);
    expect(document.body.textContent).not.toMatch(/Alt-Adresse/);
    // Ohne GPS/Abholort: ehrlicher Hinweis statt Route ab fremdem Ort
    expect(document.body.textContent).toMatch(/Noch kein Startpunkt/);
    expect(g.routes).toBe(0);
  });
});

function installMapsMock() {
  const geocodes: Array<{ address: string; cb: (r: unknown, s: string) => void }> = [];
  let routes = 0;
  const obj = function () { return { setMap: vi.fn(), setDirections: vi.fn(), setRouteIndex: vi.fn(), addListener: () => ({ remove: vi.fn() }) }; };
  (globalThis as unknown as { google: unknown }).google = {
    maps: {
      Map: vi.fn(function () {
        return { panTo: vi.fn(), setZoom: vi.fn(), fitBounds: vi.fn() };
      }),
      DirectionsService: vi.fn(function () {
        return { route: () => void routes++ };
      }),
      DirectionsRenderer: vi.fn(obj),
      Geocoder: vi.fn(function () {
        return { geocode: (req: { address: string }, cb: (r: unknown, s: string) => void) => void geocodes.push({ ...req, cb }) };
      }),
      Marker: vi.fn(obj),
      LatLng: vi.fn(),
      SymbolPath: { CIRCLE: 0 },
      TravelMode: { DRIVING: "DRIVING" },
      DirectionsStatus: { OK: "OK" },
      places: { Autocomplete: vi.fn(function () { return { addListener: () => ({ remove: vi.fn() }), getPlace: vi.fn() }; }) },
    },
  };
  return {
    geocodes,
    get routes() {
      return routes;
    },
    answer(address: string, label: string) {
      const hit = geocodes.find((x) => x.address === address)!;
      hit.cb([{ formatted_address: label, geometry: { location: { lat: () => 48.8, lng: () => 9 } } }], "OK");
    },
  };
}
