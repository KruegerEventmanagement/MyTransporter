// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
vi.mock("@/integrations/supabase/client", () => ({ supabase: fake.client }));
vi.mock("@/lib/admin-notify", () => ({ notifyAdmin: vi.fn() }));
vi.mock("@/lib/odometer-ai.functions", () => ({ recognizeOdometer: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => async () => ({ km: null, fuelPercent: null, confidence: "low" }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/profil">{children}</a>,
}));
// Kamera ist separat getestet; hier liefert ein Stub eine synthetische JPEG-Datei.
vi.mock("@/components/CameraCapture", () => ({
  CameraCapture: ({ open, onCapture }: { open: boolean; onCapture: (f: File) => void }) =>
    open ? (
      <button onClick={() => onCapture(new File([new Uint8Array([0xff, 0xd8, 1])], "t.jpg", { type: "image/jpeg" }))}>
        stub-capture
      </button>
    ) : null,
}));

import { PreDriveFlow } from "./PreDriveFlow";
import { ReturnFlow } from "./ReturnFlow";

const PRE = ["front", "front_right", "right", "back_right", "back", "back_left", "left", "front_left"];
const rows = (prefix: string, extra: string[]) =>
  [...PRE.map((s) => `${prefix}_${s}`), ...extra].map((t) => ({
    photo_type: t,
    photo_url: `b1/${t}_1.jpg`,
    created_at: "2026-01-01",
  }));

const uploads = () => fake.storageCalls.filter((c) => c.op === "upload");
const inserts = () => fake.calls.filter((c) => c.table === "trip_photos" && c.op === "insert");
const savedChecks = () => screen.queryAllByLabelText("Foto gespeichert");

beforeEach(() => {
  fake.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openPreDrive(onComplete = vi.fn()) {
  render(<PreDriveFlow bookingId="b1" pickupCode="ABC123" onComplete={onComplete} />);
  fireEvent.click(screen.getByText(/Schlüssel erhalten, weiter/));
  return onComplete;
}

describe("PreDriveFlow (Abholung)", () => {
  it("Upload-Fehler: kein Haken, Fehlermeldung; Retry speichert und zeigt signierte Vorschau", async () => {
    fake.storage.upload = [{ error: { message: "offline" } }, { error: null }];
    fake.on("trip_photos", "insert", { data: { id: "p1" }, error: null });
    await openPreDrive();
    fireEvent.click(screen.getByText(/Vorne$/));
    fireEvent.click(await screen.findByText("stub-capture"));
    expect(await screen.findByText(/nicht hochgeladen/)).toBeTruthy();
    expect(savedChecks()).toHaveLength(0);
    expect(inserts()).toHaveLength(0);

    fireEvent.click(screen.getByText("Erneut versuchen"));
    await waitFor(() => expect(savedChecks()).toHaveLength(1));
    const img = screen.getByAltText("Vorne") as HTMLImageElement;
    expect(img.src).toMatch(/^https:\/\/signed\.example\/b1\/pre_front_/);
    expect(uploads()).toHaveLength(2);
  });

  it("DB-Eintrag fehlgeschlagen: kein Erfolg; Retry ohne erneuten Upload", async () => {
    fake.on("trip_photos", "insert", { data: null, error: { message: "rls" } }, { data: { id: "p1" }, error: null });
    await openPreDrive();
    fireEvent.click(screen.getByText(/Vorne$/));
    fireEvent.click(await screen.findByText("stub-capture"));
    expect(await screen.findByText(/hochgeladen, aber nicht gespeichert/)).toBeTruthy();
    expect(savedChecks()).toHaveLength(0);
    fireEvent.click(screen.getByText("Erneut versuchen"));
    await waitFor(() => expect(savedChecks()).toHaveLength(1));
    expect(uploads()).toHaveLength(1);
    expect(inserts()).toHaveLength(2);
    expect(inserts()[1].values).toMatchObject({ photo_url: inserts()[0].values && (inserts()[0].values as { photo_url: string }).photo_url });
  });

  it("Reload stellt gespeicherte Fotos per signierter URL wieder her; Vorschaufehler behält Foto", async () => {
    fake.on("trip_photos", "select", { data: rows("pre", ["pre_interior", "pre_odometer"]), error: null });
    fake.storage.signedUrl = (path) =>
      path.includes("pre_back_1")
        ? { data: null, error: { message: "timeout" } }
        : { data: { signedUrl: `https://signed.example/${path}` }, error: null };
    await openPreDrive();
    await waitFor(() => expect(savedChecks()).toHaveLength(10));
    const imgs = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
    expect(imgs.every((i) => i.src.startsWith("https://signed.example/"))).toBe(true);
    expect(screen.getByText("Gespeichert · Vorschau nicht verfügbar")).toBeTruthy();
  });

  it("Ladefehler wird angezeigt und ist wiederholbar", async () => {
    fake.on("trip_photos", "select", { data: null, error: { message: "down" } }, { data: [], error: null });
    await openPreDrive();
    expect(await screen.findByText("Gespeicherte Fotos konnten nicht geladen werden.")).toBeTruthy();
    fireEvent.click(screen.getByText("Neu laden"));
    await waitFor(() => expect(screen.queryByText("Gespeicherte Fotos konnten nicht geladen werden.")).toBeNull());
  });

  it("Fahrtstart-Fehler: kein Fortschritt; erfolgreicher Retry meldet Start", async () => {
    fake.on("trip_photos", "select", { data: rows("pre", ["pre_interior", "pre_odometer"]), error: null });
    fake.on("bookings", "update", { data: [], error: null }, { data: [{ id: "b1" }], error: null });
    const onComplete = await openPreDrive();
    await waitFor(() => expect(savedChecks()).toHaveLength(10));
    fireEvent.change(screen.getByPlaceholderText("z.B. 42850"), { target: { value: "42850" } });
    fireEvent.click(screen.getByText(/Fahrt starten/));
    expect(await screen.findByText(/Fahrt konnte nicht gestartet werden/)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Erneut versuchen"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(42850));
  });
});

describe("ReturnFlow (Rückgabe)", () => {
  const renderReturn = (onComplete = vi.fn()) => {
    render(<ReturnFlow bookingId="b1" planId="km" startKm={100} onComplete={onComplete} />);
    return onComplete;
  };

  it("lädt vorhandene Rückgabe-, Tacho- und Belegfotos per signierter URL", async () => {
    fake.on("trip_photos", "select", {
      data: rows("post", ["post_interior", "post_odometer", "tank_receipt", "pre_front"]),
      error: null,
    });
    renderReturn();
    await waitFor(() => expect(savedChecks()).toHaveLength(9));
    const weiter = screen.getByText(/^Weiter/).closest("button")!;
    expect(weiter.disabled).toBe(false);
    fireEvent.click(weiter);
    expect((screen.getByAltText("Tacho") as HTMLImageElement).src).toMatch(/signed\.example\/b1\/post_odometer/);
  });

  it("DB-Fehler beim Foto: kein Haken, Weiter gesperrt; Retry ohne erneuten Upload", async () => {
    fake.on("trip_photos", "insert", { data: null, error: { message: "x" } }, { data: { id: "p" }, error: null });
    renderReturn();
    fireEvent.click(screen.getByText(/Vorne$/));
    fireEvent.click(await screen.findByText("stub-capture"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(savedChecks()).toHaveLength(0);
    expect(screen.getByText(/^Weiter/).closest("button")!.disabled).toBe(true);
    fireEvent.click(screen.getByText("Erneut versuchen"));
    await waitFor(() => expect(savedChecks()).toHaveLength(1));
    expect(uploads()).toHaveLength(1);
  });

  it("KM-Speicherfehler bleibt im Schritt; Erfolg führt weiter, Rückgabefehler zeigt keinen Code", async () => {
    fake.on("trip_photos", "select", {
      data: rows("post", ["post_interior", "post_odometer", "tank_receipt"]),
      error: null,
    });
    fake.on(
      "bookings",
      "update",
      { data: null, error: { message: "denied" } },
      { data: [{ id: "b1" }], error: null },
      { data: [], error: null },
    );
    renderReturn();
    await waitFor(() => expect(savedChecks()).toHaveLength(9));
    fireEvent.click(screen.getByText(/^Weiter/));
    fireEvent.change(screen.getByPlaceholderText("z.B. 42920"), { target: { value: "150" } });
    fireEvent.click(screen.getByText(/^Weiter/));
    expect(await screen.findByText(/Kilometerstand nicht gespeichert/)).toBeTruthy();
    expect(screen.queryByText("Kilometer-Abrechnung")).toBeNull();
    fireEvent.click(screen.getByText("Erneut versuchen"));
    const summary = await screen.findByText("Kilometer-Abrechnung");
    // Preisberechnung unverändert: km-Tarif berechnet alle 50 gefahrenen km
    expect(within(summary.parentElement!).getByText("50 km", { selector: "span" })).toBeTruthy();
    const updates = fake.calls.filter((c) => c.table === "bookings" && c.op === "update");
    expect(updates[1].values).toMatchObject({ end_km: 150, extra_km: 50 });

    fireEvent.click(screen.getByText(/Schlüssel zurückgeben/));
    expect(await screen.findByText(/Rückgabe nicht gespeichert/)).toBeTruthy();
    expect(screen.queryByText("Dein Rückgabecode")).toBeNull();
  });
});
