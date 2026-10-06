// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CameraCapture } from "./CameraCapture";
import { domError, fakeStream, imageFile, installMediaMocks, media, setMediaDevices } from "@/test/media-mocks";

const fileInput = () => screen.getByTestId("camera-file-input") as HTMLInputElement;
const pick = (file: File) =>
  act(async () => {
    Object.defineProperty(fileInput(), "files", { configurable: true, value: [file] });
    fireEvent.change(fileInput());
  });

function renderCam(onCapture = vi.fn(), open = true) {
  const onClose = vi.fn();
  const utils = render(
    <CameraCapture
      open={open}
      title="Vorne"
      variant="front"
      onClose={onClose}
      onCapture={onCapture}
      cameraTimeoutMs={200}
      frameTimeoutMs={300}
    />,
  );
  return { ...utils, onCapture, onClose };
}

beforeEach(() => {
  installMediaMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CameraCapture", () => {
  it("Livekamera: Auslöser liefert eine echte JPEG-Datei, Mehrfachklick nur einmal", async () => {
    setMediaDevices(async () => fakeStream().stream);
    media.videoWidth = 1280;
    media.videoHeight = 720;
    let release: () => void = () => {};
    const onCapture = vi.fn((_f: File) => new Promise<void>((r) => (release = r)));
    renderCam(onCapture);
    const shutter = await screen.findByLabelText("Foto aufnehmen");
    fireEvent.click(shutter);
    fireEvent.click(shutter);
    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    fireEvent.click(shutter);
    expect(onCapture).toHaveBeenCalledTimes(1);
    await act(async () => release());
    const file = onCapture.mock.calls[0][0] as unknown as File;
    expect(file.type).toBe("image/jpeg");
    expect(file.name).toMatch(/\.jpg$/);
    expect(file.size).toBeGreaterThan(0);
  });

  it("toBlob null + ungültiges Fallback: sichtbarer Fehler statt stillem Abbruch", async () => {
    setMediaDevices(async () => fakeStream().stream);
    media.videoWidth = 640;
    media.videoHeight = 480;
    media.toBlob = "null";
    media.toDataURL = "data:,";
    const { onCapture } = renderCam();
    fireEvent.click(await screen.findByLabelText("Foto aufnehmen"));
    expect(await screen.findByText(/Bild konnte nicht erstellt werden/)).toBeTruthy();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it("toBlob ohne Callback: Fallback über toDataURL nach Zeitlimit", async () => {
    setMediaDevices(async () => fakeStream().stream);
    media.videoWidth = 640;
    media.videoHeight = 480;
    media.toBlob = "never";
    const { onCapture } = renderCam();
    fireEvent.click(await screen.findByLabelText("Foto aufnehmen"));
    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it("verweigerter Zugriff: Hinweis, Wiederholen und nativer Foto-Weg liefern JPEG", async () => {
    const gum = setMediaDevices(async () => Promise.reject(domError("NotAllowedError")));
    const { onCapture } = renderCam();
    expect(await screen.findByText(/Kamerazugriff nicht erlaubt/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Live-Kamera erneut versuchen/));
    await waitFor(() => expect(gum).toHaveBeenCalledTimes(2));
    await pick(imageFile("galerie.png", "image/png"));
    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    expect((onCapture.mock.calls[0][0] as File).type).toBe("image/jpeg");
  });

  it("fehlende Kamera-API: direkt nativer Foto-Weg", async () => {
    setMediaDevices(null);
    renderCam();
    expect(await screen.findByText(/Live-Kamera nicht verfügbar/)).toBeTruthy();
    expect(screen.getByText("Aus Galerie auswählen")).toBeTruthy();
  });

  it("0-Dimensionen-Video: Zeitlimit-Fehler, Stream gestoppt, kein Auslöser", async () => {
    const { stream, track } = fakeStream();
    setMediaDevices(async () => stream);
    media.play = vi.fn(async () => Promise.reject(domError("NotAllowedError")));
    renderCam();
    expect(await screen.findByText(/Live-Kamera startet nicht/)).toBeTruthy();
    expect(track.stop).toHaveBeenCalled();
    expect(screen.queryByLabelText("Foto aufnehmen")).toBeNull();
  });

  it("hängende Freigabe: Foto-Weg sofort sichtbar; späte Freigabe nach Schließen wird gestoppt", async () => {
    const { stream, track } = fakeStream();
    let late: (s: MediaStream) => void = () => {};
    setMediaDevices(() => new Promise((r) => (late = r)));
    const { rerender, onCapture } = renderCam();
    expect(screen.getByText("Aus Galerie auswählen")).toBeTruthy();
    rerender(<CameraCapture open={false} title="Vorne" variant="front" onClose={vi.fn()} onCapture={onCapture} />);
    await act(async () => {
      late(stream);
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(track.stop).toHaveBeenCalled();
  });

  it("nie antwortende Freigabe endet nach Zeitlimit in Fehleranzeige", async () => {
    setMediaDevices(() => new Promise(() => {}));
    renderCam();
    expect(await screen.findByText(/Live-Kamera startet nicht/)).toBeTruthy();
  });

  it("Schließen/Unmount stoppt laufende Kamera", async () => {
    const { stream, track } = fakeStream();
    setMediaDevices(async () => stream);
    media.videoWidth = 640;
    media.videoHeight = 480;
    const { unmount } = renderCam();
    await screen.findByLabelText("Foto aufnehmen");
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it("nativer Wechsel während startender Kamera stoppt den späten Stream; Abbruch lässt Foto-Weg", async () => {
    const { stream, track } = fakeStream();
    let late: (s: MediaStream) => void = () => {};
    setMediaDevices(() => new Promise((r) => (late = r)));
    renderCam();
    const label = screen.getByText("Mit Geräte-Kamera").closest("label")!;
    expect(label.getAttribute("for")).toBe(fileInput().id);
    fireEvent.click(label);
    await act(async () => {
      late(stream);
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(track.stop).toHaveBeenCalled();
    expect(screen.getByText("Live-Kamera verwenden")).toBeTruthy();
    expect(screen.queryByLabelText("Foto aufnehmen")).toBeNull();
  });

  it("nie auflösendes play() mit 0 Dimensionen: Fehler + Dateiweg statt Hängen", async () => {
    setMediaDevices(async () => fakeStream().stream);
    media.play = vi.fn(() => new Promise<void>(() => {}));
    renderCam();
    expect(await screen.findByText(/Live-Kamera startet nicht/)).toBeTruthy();
    expect(screen.getByText("Aus Galerie auswählen")).toBeTruthy();
  });

  it("Schließen während Kodierung liefert keinen veralteten Foto-Callback", async () => {
    setMediaDevices(async () => fakeStream().stream);
    media.videoWidth = 640;
    media.videoHeight = 480;
    media.toBlob = "never";
    const { onCapture, rerender } = renderCam();
    fireEvent.click(await screen.findByLabelText("Foto aufnehmen"));
    rerender(<CameraCapture open={false} title="Vorne" variant="front" onClose={vi.fn()} onCapture={onCapture} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1700));
    });
    expect(onCapture).not.toHaveBeenCalled();
  });

  it("iOS/Android: Kamera-Input mit capture, Galerie-Input ohne capture, beide echt und per label verknüpft", () => {
    setMediaDevices(null);
    renderCam();
    const cam = fileInput();
    const gal = screen.getByTestId("camera-gallery-input") as HTMLInputElement;
    expect(cam.type).toBe("file");
    expect(cam.getAttribute("capture")).toBe("environment");
    expect(gal.hasAttribute("capture")).toBe(false);
    expect(gal.accept).toMatch(/image\/\*/);
    expect(gal.accept).toMatch(/\.heic/);
    for (const i of [cam, gal]) {
      expect(i.className).not.toMatch(/\bhidden\b/);
      expect(i.style.display).not.toBe("none");
    }
    expect(screen.getByText("Mit Geräte-Kamera").closest("label")!.htmlFor).toBe(cam.id);
    expect(screen.getByText("Aus Galerie auswählen").closest("label")!.htmlFor).toBe(gal.id);
  });

  it("Erlaubnis abgelehnt: Galerie liefert Foto, gleiche Datei erneut wählbar (value reset)", async () => {
    setMediaDevices(async () => Promise.reject(domError("NotAllowedError")));
    const { onCapture } = renderCam();
    await screen.findByText(/Kamerazugriff nicht erlaubt/);
    const gal = screen.getByTestId("camera-gallery-input") as HTMLInputElement;
    const f = imageFile("gleich.png", "image/png");
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        Object.defineProperty(gal, "files", { configurable: true, value: [f] });
        fireEvent.change(gal);
      });
      expect(gal.value).toBe("");
      await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(i + 1));
    }
  });

  it("HEIC aus der iPhone-Galerie wird nicht abgewiesen und bleibt als HEIC typisiert", async () => {
    setMediaDevices(null);
    const { onCapture } = renderCam();
    const gal = screen.getByTestId("camera-gallery-input") as HTMLInputElement;
    media.imageFails = true;
    await act(async () => {
      Object.defineProperty(gal, "files", { configurable: true, value: [new File([new Uint8Array([1, 2, 3])], "IMG_1.HEIC", { type: "image/heic" })] });
      fireEvent.change(gal);
    });
    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    const out = onCapture.mock.calls[0][0] as File;
    expect(out.type).toBe("image/heic");
    expect(out.name).toMatch(/\.heic$/);
  });
});
