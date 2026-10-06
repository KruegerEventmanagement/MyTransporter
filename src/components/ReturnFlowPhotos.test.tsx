// @vitest-environment jsdom
// Rückgabe mit ECHTEM Kamera-Dialog: native Kamera/Galerie bei fehlender oder verweigerter Live-Kamera,
// korrekte Tag-Zuordnung in der lokalen Warteschlange, keine Freigabe ohne Nachweis.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { domError, imageFile, installMediaMocks, setMediaDevices } from "@/test/media-mocks";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
const shared = await vi.hoisted(async () => ({ store: (await import("@/lib/photo-queue")).memoryQueueStore() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: fake.client }));
vi.mock("@/lib/photo-queue", async (orig) => ({
  ...(await orig<typeof import("@/lib/photo-queue")>()),
  openIdbQueueStore: async () => shared.store,
}));
vi.mock("@/lib/admin-notify", () => ({ notifyAdmin: vi.fn() }));
vi.mock("@/lib/odometer-ai.functions", () => ({ recognizeOdometer: "recognize" }));
vi.mock("@/lib/trip-return.functions", () => ({ reportReturn: "report" }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => async () => ({ km: null, fuelPercent: null, confidence: "low" }),
}));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

import { ReturnFlow } from "./ReturnFlow";

let online = false;
Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
const SIDES = ["Vorne", "Vorne rechts", "Rechte Seite", "Hinten rechts", "Hinten", "Hinten links", "Linke Seite", "Vorne links"];
const tags = () => [...shared.store.items.values()].map((i) => i.tag).sort();

async function pickVia(kind: "camera" | "gallery", file: File) {
  const testId = kind === "camera" ? "camera-file-input" : "camera-gallery-input";
  const input = (await screen.findByTestId(testId)) as HTMLInputElement;
  const label = screen.getByText(kind === "camera" ? "Mit Geräte-Kamera" : "Aus Galerie auswählen").closest("label")!;
  expect(label.htmlFor).toBe(input.id);
  fireEvent.click(label);
  await act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    fireEvent.change(input);
  });
  expect(input.value).toBe("");
  await waitFor(() => expect(screen.queryByTestId(testId)).toBeNull());
}
const openSlot = (text: RegExp | string) => fireEvent.click(screen.getByText(text).closest("button")!);

beforeEach(() => {
  installMediaMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  fake.reset();
  localStorage.clear();
  shared.store.items.clear();
  online = false;
  fake.storage.upload = [{ error: "throw" }];
  fake.on("bookings", "update", () => Promise.reject(new TypeError("Failed to fetch")));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mount = () => render(<ReturnFlow bookingId="b1" planId="km" startKm={100} userId="u1" onComplete={vi.fn()} />);

describe("ReturnFlow – native Foto-Wege", () => {
  it("ohne Live-Kamera: alle Außen-/Innenfotos per Kamera oder Galerie, je richtiger Tag, Weiter erst danach", async () => {
    setMediaDevices(null);
    mount();
    for (const [i, label] of SIDES.entries()) {
      expect(screen.getByText(/^Weiter/).closest("button")!.disabled).toBe(true);
      openSlot(new RegExp(`${label}$`));
      await pickVia(i % 2 ? "gallery" : "camera", imageFile(`s${i}.png`, "image/png"));
    }
    openSlot("Foto vom Innenraum aufnehmen");
    await pickVia("gallery", new File([new Uint8Array([1, 2])], "IMG.HEIC", { type: "image/heic" }));
    expect(tags()).toEqual(
      ["post_back", "post_back_left", "post_back_right", "post_front", "post_front_left", "post_front_right", "post_interior", "post_left", "post_right"].sort(),
    );
    expect(screen.getByTestId("local-post_front").textContent).toBe("Auf diesem Gerät gespeichert");
    expect(screen.getByText(/^Weiter/).closest("button")!.disabled).toBe(false);
  });

  it("verweigerte Kamera: Galerie funktioniert; erneut aufnehmen ersetzt im selben Slot", async () => {
    setMediaDevices(async () => Promise.reject(domError("NotAllowedError")));
    mount();
    openSlot(/Vorne$/);
    await screen.findByText(/Kamerazugriff nicht erlaubt/);
    const f = imageFile("gleich.png", "image/png");
    await pickVia("gallery", f);
    openSlot(/Vorne$/);
    await pickVia("gallery", f);
    await waitFor(() => expect(tags().filter((t) => t === "post_front").length).toBeGreaterThanOrEqual(1));
    expect(tags().every((t) => t === "post_front")).toBe(true);
    expect(screen.getByTestId("local-post_front")).toBeTruthy();
    expect(screen.getByText(/^Weiter/).closest("button")!.disabled).toBe(true);
  });
});
