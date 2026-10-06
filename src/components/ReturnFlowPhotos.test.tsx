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

  it("verweigerte Kamera: Galerie funktioniert, gleiche Datei im nächsten Slot erneut wählbar, gesicherter Slot gesperrt", async () => {
    setMediaDevices(async () => Promise.reject(domError("NotAllowedError")));
    mount();
    openSlot(/Vorne$/);
    await screen.findByText(/Kamerazugriff nicht erlaubt/);
    const f = imageFile("gleich.png", "image/png");
    await pickVia("gallery", f);
    expect(screen.getByText(/Vorne$/).closest("button")!.disabled).toBe(true);
    openSlot(/Hinten$/);
    await pickVia("gallery", f);
    expect(tags()).toEqual(["post_back", "post_front"]);
    expect(screen.getByText(/^Weiter/).closest("button")!.disabled).toBe(true);
  });
});

describe("ReturnFlow – Bearbeitungspauschale", () => {
  it("Hinweis sichtbar; technisches Problem ohne, bewusstes Nichtbereitstellen mit Pauschalen-Hinweis", async () => {
    setMediaDevices(null);
    mount();
    expect(screen.getByTestId("documentation-fee-notice").textContent).toMatch(/Bearbeitungspauschale von 30 € berechnet/);
    fireEvent.click(screen.getByText("Foto oder Kamera funktioniert nicht?"));
    // Begründung erst nach Einordnung
    expect(screen.queryByLabelText(/Bitte kurz begründen/)).toBeNull();
    fireEvent.click(screen.getByLabelText(/Technisches Problem/));
    expect(screen.getByTestId("exception-photos-technical").textContent).toMatch(/keine Bearbeitungspauschale/);
    expect(screen.queryByTestId("exception-photos-fee")).toBeNull();
    fireEvent.change(screen.getByLabelText(/Bitte kurz begründen/), { target: { value: "Galerie öffnet nicht" } });
    const draft = () => JSON.stringify(Object.fromEntries(Object.entries(localStorage)));
    await waitFor(() => expect(draft()).toMatch(/\[Technisches Problem\] Galerie öffnet nicht/));
    fireEvent.click(screen.getByLabelText(/nicht bereitstellen/));
    expect(screen.getByTestId("exception-photos-fee").textContent).toMatch(/30 €/);
    expect((screen.getByLabelText(/Bitte kurz begründen/) as HTMLTextAreaElement).value).toBe("Galerie öffnet nicht");
    await waitFor(() => expect(draft()).toMatch(/\[Nachweis nicht bereitgestellt\] Galerie öffnet nicht/));
  });
});
