// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CaptureError,
  canvasToJpegBlob,
  classifyCameraError,
  getUserMediaWithTimeout,
  normalizeImageFile,
  waitForVideoFrame,
} from "./image-capture";
import { domError, fakeStream, imageFile, installMediaMocks, media } from "@/test/media-mocks";

const canvas = (w = 10, h = 10) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

beforeEach(() => installMediaMocks());

describe("canvasToJpegBlob", () => {
  it("liefert JPEG über toBlob", async () => {
    const b = await canvasToJpegBlob(canvas());
    expect(b.type).toBe("image/jpeg");
    expect(b.size).toBeGreaterThan(0);
  });

  it("fällt bei toBlob=null auf toDataURL zurück", async () => {
    media.toBlob = "null";
    const b = await canvasToJpegBlob(canvas());
    expect(b.type).toBe("image/jpeg");
  });

  it("fällt bei werfendem toBlob auf toDataURL zurück", async () => {
    media.toBlob = "throw";
    const b = await canvasToJpegBlob(canvas());
    expect(b.type).toBe("image/jpeg");
  });

  it("wartet nicht endlos, wenn toBlob nie antwortet", async () => {
    media.toBlob = "never";
    const t = Date.now();
    const b = await canvasToJpegBlob(canvas(), { timeoutMs: 50 });
    expect(b.type).toBe("image/jpeg");
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it("wirft statt falschem .jpg-Inhalt (PNG oder leer)", async () => {
    media.toBlob = "null";
    media.toDataURL = "data:image/png;base64,iVBORw0K";
    await expect(canvasToJpegBlob(canvas())).rejects.toBeInstanceOf(CaptureError);
    media.toDataURL = "data:,";
    await expect(canvasToJpegBlob(canvas())).rejects.toBeInstanceOf(CaptureError);
  });

  it("wirft bei 0-Pixel-Canvas", async () => {
    await expect(canvasToJpegBlob(canvas(0, 0))).rejects.toMatchObject({ code: "canvas_empty" });
  });
});

describe("waitForVideoFrame", () => {
  it("läuft ohne Bild in ein Zeitlimit", async () => {
    const v = document.createElement("video");
    await expect(waitForVideoFrame(v, 60)).rejects.toMatchObject({ code: "video_timeout" });
  });

  it("löst sich, sobald Dimensionen vorhanden sind", async () => {
    const v = document.createElement("video");
    const p = waitForVideoFrame(v, 2000);
    media.videoWidth = 640;
    media.videoHeight = 480;
    v.dispatchEvent(new Event("loadedmetadata"));
    await expect(p).resolves.toBeUndefined();
  });
});

describe("getUserMediaWithTimeout", () => {
  it("bricht eine nie antwortende Kamerafreigabe ab und stoppt einen späten Stream", async () => {
    const { stream, track } = fakeStream();
    let resolveLate: (s: MediaStream) => void = () => {};
    const md = { getUserMedia: () => new Promise<MediaStream>((r) => (resolveLate = r)) } as MediaDevices;
    await expect(getUserMediaWithTimeout(md, { video: true }, 30)).rejects.toMatchObject({ code: "camera_timeout" });
    resolveLate(stream);
    await new Promise((r) => setTimeout(r, 0));
    expect(track.stop).toHaveBeenCalled();
  });

  it("stoppt den Stream, wenn inzwischen abgebrochen wurde", async () => {
    const { stream, track } = fakeStream();
    const md = { getUserMedia: async () => stream } as unknown as MediaDevices;
    await expect(getUserMediaWithTimeout(md, { video: true }, 1000, () => true)).rejects.toBeTruthy();
    expect(track.stop).toHaveBeenCalled();
  });

  it("reicht Berechtigungsfehler durch", async () => {
    const md = { getUserMedia: async () => Promise.reject(domError("NotAllowedError")) } as unknown as MediaDevices;
    const err = await getUserMediaWithTimeout(md, { video: true }, 1000).catch((e) => e);
    expect(classifyCameraError(err)).toBe("denied");
  });
});

describe("classifyCameraError", () => {
  it("ordnet Fehler korrekt zu", () => {
    expect(classifyCameraError(domError("SecurityError"))).toBe("denied");
    expect(classifyCameraError(domError("NotFoundError"))).toBe("notfound");
    expect(classifyCameraError(domError("NotReadableError"))).toBe("busy");
    expect(classifyCameraError(new CaptureError("x", "camera_timeout"))).toBe("timeout");
    expect(classifyCameraError(new Error("?"))).toBe("unsupported");
  });
});

describe("normalizeImageFile", () => {
  it("erzeugt JPEG und gibt Objekt-URL frei", async () => {
    const b = await normalizeImageFile(imageFile("IMG_1.HEIC", ""));
    expect(b.type).toBe("image/jpeg");
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("lehnt Nicht-Bilder, leere und zu große Dateien ab", async () => {
    await expect(normalizeImageFile(imageFile("a.pdf", "application/pdf"))).rejects.toMatchObject({
      code: "not_image",
    });
    await expect(normalizeImageFile(imageFile("a.jpg", "image/jpeg", 0))).rejects.toBeInstanceOf(CaptureError);
    const big = imageFile("a.jpg");
    Object.defineProperty(big, "size", { value: 31 * 1024 * 1024 });
    await expect(normalizeImageFile(big)).rejects.toMatchObject({ code: "too_large" });
  });

  it("meldet unlesbare Fotos", async () => {
    media.imageFails = true;
    await expect(normalizeImageFile(imageFile())).rejects.toMatchObject({ code: "decode_failed" });
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("vi ist verfügbar", () => expect(vi).toBeTruthy());
});
