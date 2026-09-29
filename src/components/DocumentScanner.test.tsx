// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { domError, fakeStream, imageFile, installMediaMocks, media, setMediaDevices } from "@/test/media-mocks";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
vi.mock("@/integrations/supabase/client", () => ({ supabase: fake.client }));

import { DocumentScanner } from "./DocumentScanner";

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const pick = (file: File | null) =>
  act(async () => {
    const input = fileInput();
    Object.defineProperty(input, "files", { configurable: true, value: file ? [file] : [] });
    fireEvent.change(input);
  });
const previewImg = () => screen.queryByAltText("Aufgenommenes Dokument") as HTMLImageElement | null;

function renderScanner(props: Partial<React.ComponentProps<typeof DocumentScanner>> = {}) {
  const onComplete = vi.fn();
  const onCapture = vi.fn();
  render(
    <DocumentScanner
      docType="id_front"
      isComplete={false}
      onComplete={onComplete}
      mode="pending"
      onCapture={onCapture}
      cameraTimeoutMs={200}
      frameTimeoutMs={300}
      {...props}
    />,
  );
  return { onComplete, onCapture };
}

beforeEach(() => {
  installMediaMocks();
  fake.reset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DocumentScanner – Dateiauswahl", () => {
  it("Datei → Vorschau → Erneut öffnet wieder die Dateiauswahl; zweite Datei ersetzt die Vorschau", async () => {
    const gum = setMediaDevices(async () => fakeStream().stream);
    const { onCapture } = renderScanner();
    fireEvent.click(screen.getByText("Mit Handy-Kamera / Foto hochladen"));
    await pick(imageFile("eins.jpg"));
    await waitFor(() => expect(previewImg()).not.toBeNull());
    const firstSrc = previewImg()!.src;

    const clickSpy = vi.spyOn(fileInput(), "click");
    fireEvent.click(screen.getByText("Erneut"));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(gum).not.toHaveBeenCalled();
    // Vorschau bleibt bis zur neuen Auswahl sichtbar – kein schwarzes Bild
    expect(previewImg()).not.toBeNull();

    await pick(imageFile("zwei.jpg"));
    await waitFor(() => expect(previewImg()!.src).not.toBe(firstSrc));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstSrc);

    fireEvent.click(screen.getByText("Übernehmen"));
    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    const blob = onCapture.mock.calls[0][1] as Blob;
    expect(blob.type).toBe("image/jpeg");
    expect(gum).not.toHaveBeenCalled();
  });

  it("Abbruch der Dateiauswahl nach Erneut lässt die bisherige Vorschau nutzbar", async () => {
    setMediaDevices(async () => fakeStream().stream);
    const { onCapture } = renderScanner();
    await pick(imageFile());
    await waitFor(() => expect(previewImg()).not.toBeNull());
    fireEvent.click(screen.getByText("Erneut"));
    await pick(null); // Abbruch
    expect(previewImg()).not.toBeNull();
    fireEvent.click(screen.getByText("Übernehmen"));
    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
  });

  it("lehnt Nicht-Bilder ab", async () => {
    renderScanner();
    await pick(imageFile("x.pdf", "application/pdf"));
    expect(await screen.findByText("Bitte ein Foto (Bild-Datei) auswählen.")).toBeTruthy();
  });
});

describe("DocumentScanner – Live-Kamera", () => {
  it("Aufnahme → Vorschau → Erneut zeigt wieder das Livebild (Stream angehängt)", async () => {
    const { stream, track } = fakeStream();
    const gum = setMediaDevices(async () => stream);
    media.videoWidth = 1280;
    media.videoHeight = 720;
    renderScanner();
    fireEvent.click(screen.getByText(/Foto aufnehmen \(/));
    const shutter = await screen.findByLabelText("Foto aufnehmen");
    const video = document.querySelector("video") as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(stream));
    fireEvent.click(shutter);
    await waitFor(() => expect(previewImg()).not.toBeNull());
    fireEvent.click(screen.getByText("Erneut"));
    await screen.findByLabelText("Foto aufnehmen");
    const video2 = document.querySelector("video") as HTMLVideoElement;
    await waitFor(() => expect(video2.srcObject).toBe(stream));
    expect(track.readyState).toBe("live");
    expect(gum).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Schließen"));
    expect(track.stop).toHaveBeenCalled();
  });

  it("verweigerter Zugriff zeigt Hinweis und den Foto-Weg", async () => {
    setMediaDevices(async () => Promise.reject(domError("NotAllowedError")));
    renderScanner();
    fireEvent.click(screen.getByText(/Foto aufnehmen \(/));
    expect(await screen.findByText("Kamerazugriff nicht erlaubt")).toBeTruthy();
    expect(screen.getByText("Foto aufnehmen / auswählen")).toBeTruthy();
  });

  it("fehlende Kamera-API führt direkt zum Foto-Weg", async () => {
    setMediaDevices(null);
    renderScanner();
    fireEvent.click(screen.getByText(/Foto aufnehmen \(/));
    expect(await screen.findByText("Live-Kamera nicht verfügbar")).toBeTruthy();
  });

  it("abgelehntes play() ohne Bild endet in Zeitlimit-Fehler mit Foto-Weg, Stream gestoppt", async () => {
    const { stream, track } = fakeStream();
    setMediaDevices(async () => stream);
    media.play = vi.fn(async () => Promise.reject(domError("NotAllowedError")));
    renderScanner();
    fireEvent.click(screen.getByText(/Foto aufnehmen \(/));
    expect(await screen.findByText("Live-Kamera startet nicht")).toBeTruthy();
    expect(track.stop).toHaveBeenCalled();
    expect(screen.getByText("Foto aufnehmen / auswählen")).toBeTruthy();
  });

  it("abgelehntes play() mit Bild bleibt nutzbar", async () => {
    setMediaDevices(async () => fakeStream().stream);
    media.play = vi.fn(async () => Promise.reject(domError("NotAllowedError")));
    media.videoWidth = 640;
    media.videoHeight = 480;
    renderScanner();
    fireEvent.click(screen.getByText(/Foto aufnehmen \(/));
    expect(await screen.findByLabelText("Foto aufnehmen")).toBeTruthy();
  });

  it("hängende Kamerafreigabe: Foto-Weg sofort erreichbar, späte Freigabe nach Schließen wird gestoppt", async () => {
    const { stream, track } = fakeStream();
    let late: (s: MediaStream) => void = () => {};
    setMediaDevices(() => new Promise((r) => (late = r)));
    renderScanner({ cameraTimeoutMs: 5000 });
    fireEvent.click(screen.getByText(/Foto aufnehmen \(/));
    expect(screen.getByText("Stattdessen Foto mit Geräte-Kamera / aus Galerie")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Schließen"));
    await act(async () => {
      late(stream);
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(track.stop).toHaveBeenCalled();
    expect(screen.queryByLabelText("Foto aufnehmen")).toBeNull();
  });

  it("nie antwortende Kamerafreigabe endet in Fehler statt Endlos-Warten", async () => {
    setMediaDevices(() => new Promise(() => {}));
    renderScanner({ cameraTimeoutMs: 80 });
    fireEvent.click(screen.getByText(/Foto aufnehmen \(/));
    expect(await screen.findByText("Live-Kamera startet nicht")).toBeTruthy();
  });

  it("toBlob ohne Callback und ungültiges Fallback → sichtbarer Fehler, kein Upload", async () => {
    setMediaDevices(async () => fakeStream().stream);
    media.videoWidth = 640;
    media.videoHeight = 480;
    media.toBlob = "null";
    media.toDataURL = "data:,";
    const { onCapture } = renderScanner();
    fireEvent.click(screen.getByText(/Foto aufnehmen \(/));
    fireEvent.click(await screen.findByLabelText("Foto aufnehmen"));
    expect(await screen.findByText("Bitte erneut scannen")).toBeTruthy();
    expect(onCapture).not.toHaveBeenCalled();
  });
});

describe("DocumentScanner – Upload", () => {
  it("fehlgeschlagener Ersatz-Upload behält altes Dokument; Wiederholen nutzt dieselbe Aufnahme", async () => {
    fake.storage.upload = [{ error: { message: "offline" } }, { error: null }];
    fake.on("user_documents", "insert", { data: { id: "neu" }, error: null });
    fake.on("user_documents", "update", { data: null, error: null });
    const { onComplete } = renderScanner({ mode: "upload", isComplete: true, onCapture: undefined });
    fireEvent.click(screen.getByText("Mit Handy-Kamera / Foto hochladen"));
    await pick(imageFile());
    fireEvent.click(await screen.findByText("Übernehmen"));
    expect(await screen.findByText(/Speichern fehlgeschlagen/)).toBeTruthy();
    expect(fake.calls.filter((c) => c.table === "user_documents")).toHaveLength(0);
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Erneut versuchen"));
    fireEvent.click(await screen.findByText("Übernehmen"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const ops = fake.calls.filter((c) => c.table === "user_documents" && c.op !== "select").map((c) => c.op);
    expect(ops).toEqual(["insert", "update"]);
  });

  it("DB-Eintrag des Ersatzes scheitert: altes Dokument unberührt; Retry ohne erneuten Upload", async () => {
    fake.on("user_documents", "insert", { data: null, error: { message: "rls" } }, { data: { id: "neu" }, error: null });
    const { onComplete } = renderScanner({ mode: "upload", isComplete: true, onCapture: undefined });
    await pick(imageFile());
    fireEvent.click(await screen.findByText("Übernehmen"));
    expect(await screen.findByText(/Speichern fehlgeschlagen/)).toBeTruthy();
    expect(fake.calls.some((c) => c.table === "user_documents" && c.op === "update")).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Erneut versuchen"));
    fireEvent.click(await screen.findByText("Übernehmen"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(fake.storageCalls.filter((c) => c.op === "upload")).toHaveLength(1);
  });

  it("verlorene Insert-Antwort: Retry findet vorhandenen Eintrag und trägt nicht doppelt ein", async () => {
    fake.on("user_documents", "insert", { data: null, error: { message: "timeout" } });
    fake.on("user_documents", "select", { data: null, error: null }, { data: { id: "schon-da" }, error: null });
    const { onComplete } = renderScanner({ mode: "upload", isComplete: false, onCapture: undefined });
    await pick(imageFile());
    fireEvent.click(await screen.findByText("Übernehmen"));
    await screen.findByText(/Speichern fehlgeschlagen/);
    fireEvent.click(screen.getByText("Erneut versuchen"));
    fireEvent.click(await screen.findByText("Übernehmen"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(fake.calls.filter((c) => c.table === "user_documents" && c.op === "insert")).toHaveLength(1);
  });
});

describe("DocumentScanner – Abbruch-Rennen", () => {
  it("nativer Wechsel während startender Kamera stoppt den späten Stream", async () => {
    const { stream, track } = fakeStream();
    let late: (s: MediaStream) => void = () => {};
    setMediaDevices(() => new Promise((r) => (late = r)));
    renderScanner({ cameraTimeoutMs: 5000 });
    fireEvent.click(screen.getByText(/Foto aufnehmen \(/));
    const clickSpy = vi.spyOn(fileInput(), "click");
    fireEvent.click(screen.getByText("Stattdessen Foto mit Geräte-Kamera / aus Galerie"));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      late(stream);
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(track.stop).toHaveBeenCalled();
    // Abbruch des Pickers: nutzbarer Bildschirm mit Foto-Weg, kein Livebild
    expect(screen.getByText("Foto aufnehmen / auswählen")).toBeTruthy();
    expect(screen.queryByLabelText("Foto aufnehmen")).toBeNull();
  });

  it("nie auflösendes play() mit 0 Dimensionen endet in bedienbarem Fehler", async () => {
    setMediaDevices(async () => fakeStream().stream);
    media.play = vi.fn(() => new Promise<void>(() => {}));
    renderScanner();
    fireEvent.click(screen.getByText(/Foto aufnehmen \(/));
    expect(await screen.findByText("Live-Kamera startet nicht")).toBeTruthy();
    expect(screen.getByText("Foto aufnehmen / auswählen")).toBeTruthy();
  });

  it("Schließen während langsamer Kodierung öffnet das Overlay nicht wieder", async () => {
    setMediaDevices(async () => fakeStream().stream);
    media.videoWidth = 640;
    media.videoHeight = 480;
    media.toBlob = "never";
    const { onCapture } = renderScanner();
    fireEvent.click(screen.getByText(/Foto aufnehmen \(/));
    fireEvent.click(await screen.findByLabelText("Foto aufnehmen"));
    fireEvent.click(screen.getByLabelText("Schließen"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1700));
    });
    expect(previewImg()).toBeNull();
    expect(screen.getByText("Mit Handy-Kamera / Foto hochladen")).toBeTruthy();
    expect(onCapture).not.toHaveBeenCalled();
  });
});
