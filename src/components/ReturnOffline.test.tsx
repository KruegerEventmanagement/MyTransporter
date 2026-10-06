// @vitest-environment jsdom
// Offline: alle Fotos + Werte erfassen → Reload → Reconnect → genau EINE erfolgreiche Rückgabemeldung.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
const shared = await vi.hoisted(async () => ({ store: (await import("@/lib/photo-queue")).memoryQueueStore() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: fake.client }));
vi.mock("@/lib/photo-queue", async (orig) => ({
  ...(await orig<typeof import("@/lib/photo-queue")>()),
  // Dauerhafter Gerätespeicher über Remounts (Reload) hinweg.
  openIdbQueueStore: async () => shared.store,
}));
vi.mock("@/lib/admin-notify", () => ({ notifyAdmin: vi.fn() }));
vi.mock("@/lib/odometer-ai.functions", () => ({ recognizeOdometer: "recognize" }));
vi.mock("@/lib/trip-return.functions", () => ({ reportReturn: "report" }));
const reportImpl = vi.fn();
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: string) =>
    fn === "report" ? (a: unknown) => reportImpl(a) : async () => ({ km: null, fuelPercent: null, confidence: "low" }),
}));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/components/CameraCapture", () => ({
  CameraCapture: ({ open, onCapture }: { open: boolean; onCapture: (f: File) => void }) =>
    open ? <button onClick={() => onCapture(new File([new Uint8Array([0xff, 0xd8, 1])], "t.jpg", { type: "image/jpeg" }))}>stub-capture</button> : null,
}));

import { ReturnFlow } from "./ReturnFlow";

let online = false;
const setOnline = (v: boolean) => {
  online = v;
  if (v) window.dispatchEvent(new Event("online"));
};
Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });

const SIDES = ["Vorne", "Vorne rechts", "Rechte Seite", "Hinten rechts", "Hinten", "Hinten links", "Linke Seite", "Vorne links"];
const capture = async (el: HTMLElement) => {
  fireEvent.click(el.closest("button")!);
  fireEvent.click(await screen.findByText("stub-capture"));
  await waitFor(() => expect(screen.queryByText("stub-capture")).toBeNull());
};
const confirmed = new Set<string>();

beforeEach(() => {
  fake.reset();
  localStorage.clear();
  shared.store.items.clear();
  confirmed.clear();
  reportImpl.mockReset();
  online = false;
  // Offline: Storage-Upload wirft Netzfehler; online: gelingt.
  fake.storage.upload = [];
  const client = fake.client.storage.from as unknown as { mockImplementation: (f: () => unknown) => void };
  void client;
  fake.on("trip_photos", "insert", (st) => {
    const v = st.values as { photo_type: string };
    confirmed.add(v.photo_type);
    return { data: { id: v.photo_type }, error: null };
  });
  fake.on("bookings", "update", () => (online ? { data: [{ id: "b1" }], error: null } : Promise.reject(new TypeError("Failed to fetch"))));
});
afterEach(() => cleanup());

function mount() {
  return render(<ReturnFlow bookingId="b1" planId="km" startKm={100} userId="u1" onComplete={vi.fn()} />);
}

describe("Offline-Rückgabe", () => {
  it("vollständig offline erfasst → Reload → Reconnect → Upload zuerst, dann genau eine Meldung", async () => {
    fake.storage.upload = [{ error: "throw" }];
    mount();
    for (const label of SIDES) await capture(screen.getByText(new RegExp(`${label}$`)));
    await capture(screen.getByText("Foto vom Innenraum aufnehmen"));
    // Lokal gesichert, aber ehrlich als nicht übertragen gekennzeichnet
    expect(screen.getByTestId("photo-queue").textContent).toMatch(/9 Foto\(s\) noch nicht übertragen/);
    expect(screen.getByTestId("local-post_front").textContent).toBe("Auf diesem Gerät gespeichert");
    fireEvent.click(screen.getByText(/^Weiter/));

    fireEvent.change(screen.getByPlaceholderText("z.B. 42920"), { target: { value: "150" } });
    await capture(screen.getByText("Foto vom Tacho aufnehmen"));
    await capture(screen.getByText("Foto der Tankanzeige aufnehmen"));
    fireEvent.click(screen.getByText(/^Weiter/));
    await screen.findByTestId("km-local");

    await capture(screen.getAllByText("Tankbeleg scannen").find((e) => e.closest("button"))!);
    fireEvent.click(screen.getByText(/Schlüssel zurückgeben/));
    expect(screen.getByTestId("report-pending").textContent).toMatch(/noch nicht serverseitig bestätigt/);
    expect(reportImpl).not.toHaveBeenCalled();
    expect(shared.store.items.size).toBe(12);

    // Reload (App neu geöffnet, weiterhin offline)
    cleanup();
    mount();
    await screen.findByTestId("report-pending");
    expect(screen.getByTestId("photo-queue").textContent).toMatch(/12 Foto\(s\)/);
    expect(reportImpl).not.toHaveBeenCalled();

    // Reconnect: Meldung darf erst NACH allen Uploads kommen
    fake.storage.upload = [{ error: null }];
    reportImpl.mockImplementation(async () => {
      expect(confirmed.size).toBe(12);
      expect(shared.store.items.size).toBe(0);
      return { ok: true, returnCode: "ABC234", reviewReason: null };
    });
    await act(async () => setOnline(true));
    expect(await screen.findByText("ABC234")).toBeTruthy();
    expect(reportImpl).toHaveBeenCalledTimes(1);
    expect(reportImpl.mock.calls[0]![0]).toMatchObject({ data: { bookingId: "b1", endKm: 150 } });
    // weiteres online-Ereignis / Mehrfachauslösung: keine zweite Meldung
    await act(async () => setOnline(true));
    expect(reportImpl).toHaveBeenCalledTimes(1);
  });

  it("Meldung scheitert wegen fehlender Nachweise während Uploads laufen → nach Upload automatisch erneut", async () => {
    online = true;
    // erster Upload hängt bis zur Freigabe
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fake.storage.upload = [{ error: null }];
    const realFrom = fake.client.storage.from;
    let first = true;
    (fake.client.storage as { from: unknown }).from = vi.fn(() => {
      const b = (realFrom as () => { upload: (p: string) => Promise<unknown> })();
      return {
        ...b,
        upload: async (p: string) => {
          if (first && p.includes("tank_receipt")) {
            first = false;
            await gate;
          }
          return b.upload(p);
        },
      };
    });
    fake.on("trip_photos", "select", {
      data: ["post_front", "post_front_right", "post_right", "post_back_right", "post_back", "post_back_left", "post_left", "post_front_left", "post_interior", "post_odometer", "post_fuel"].map((t) => ({
        photo_type: t, photo_url: `b1/${t}_1.jpg`, created_at: "2026-10-06",
      })),
      error: null,
    });
    localStorage.clear();
    mount();
    await waitFor(() => expect(screen.getAllByLabelText("Foto gespeichert").length).toBeGreaterThanOrEqual(9));
    fireEvent.click(screen.getByText(/^Weiter/));
    fireEvent.change(screen.getByPlaceholderText("z.B. 42920"), { target: { value: "150" } });
    fireEvent.click(screen.getByText(/^Weiter/));
    await capture(await screen.findByText((_, el) => el?.tagName === "P" && el.textContent === "Tankbeleg scannen"));
    // Upload hängt → Klick startet keine Meldung, sondern wartet
    fireEvent.click(screen.getByText(/Schlüssel zurückgeben/));
    fireEvent.click(screen.getByText(/Schlüssel zurückgeben/)); // Doppelklick
    expect(reportImpl).not.toHaveBeenCalled();
    reportImpl.mockResolvedValue({ ok: true, returnCode: "XYZ789", reviewReason: null });
    await act(async () => release());
    expect(await screen.findByText("XYZ789")).toBeTruthy();
    expect(reportImpl).toHaveBeenCalledTimes(1);
    (fake.client.storage as { from: unknown }).from = realFrom;
  });

  it("ohne Nutzeraktion wird nie automatisch gemeldet", async () => {
    online = true;
    mount();
    await act(async () => setOnline(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(reportImpl).not.toHaveBeenCalled();
  });
});
