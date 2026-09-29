/**
 * Vollständig gemockte Browser-Medien-APIs für jsdom-Tests.
 * Keine echten Kameras, Konten, Dokumente oder Netzwerkzugriffe.
 */
import { vi } from "vitest";

export interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
  readyState: "live" | "ended";
  getCapabilities: () => Record<string, unknown>;
  applyConstraints: ReturnType<typeof vi.fn>;
}

export function fakeStream() {
  const track: FakeTrack = {
    readyState: "live",
    stop: vi.fn(function (this: void) {
      track.readyState = "ended";
    }),
    getCapabilities: () => ({}),
    applyConstraints: vi.fn(async () => undefined),
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track };
}

export const media = {
  videoWidth: 0,
  videoHeight: 0,
  play: vi.fn(async (): Promise<void> => undefined) as () => Promise<void>,
  toBlob: "ok" as "ok" | "null" | "throw" | "never",
  toDataURL: "data:image/jpeg;base64,/9j/AA==" as string,
  imageSize: { w: 800, h: 600 },
  imageFails: false,
  urlCounter: 0,
};

export function installMediaMocks() {
  media.videoWidth = 0;
  media.videoHeight = 0;
  media.play = vi.fn(async (): Promise<void> => undefined);
  media.toBlob = "ok";
  media.toDataURL = "data:image/jpeg;base64,/9j/AA==";
  media.imageSize = { w: 800, h: 600 };
  media.imageFails = false;
  media.urlCounter = 0;

  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => media.videoWidth,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => media.videoHeight,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: function () {
      return media.play();
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    get(this: { _src?: unknown }) {
      return this._src ?? null;
    },
    set(this: { _src?: unknown }, v: unknown) {
      this._src = v;
    },
  });

  const ctx = {
    drawImage: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
    })),
    putImageData: vi.fn(),
    filter: "",
  };
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => ctx,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value: function (cb: (b: Blob | null) => void, type: string) {
      if (media.toBlob === "throw") throw new Error("toBlob kaputt");
      if (media.toBlob === "never") return;
      if (media.toBlob === "null") return setTimeout(() => cb(null), 0);
      setTimeout(() => cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], { type })), 0);
    },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
    configurable: true,
    value: () => media.toDataURL,
  });

  globalThis.URL.createObjectURL = vi.fn(() => `blob:mock/${++media.urlCounter}`);
  globalThis.URL.revokeObjectURL = vi.fn();

  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    set src(_v: string) {
      setTimeout(() => {
        if (media.imageFails) this.onerror?.();
        else {
          this.naturalWidth = media.imageSize.w;
          this.naturalHeight = media.imageSize.h;
          this.onload?.();
        }
      }, 0);
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

export function setMediaDevices(getUserMedia: ((c: MediaStreamConstraints) => Promise<MediaStream>) | null) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: getUserMedia ? { getUserMedia: vi.fn(getUserMedia) } : undefined,
  });
  return (navigator.mediaDevices as unknown as { getUserMedia: ReturnType<typeof vi.fn> } | undefined)
    ?.getUserMedia;
}

export function imageFile(name = "foto.jpg", type = "image/jpeg", bytes = 64) {
  return new File([new Uint8Array(bytes).fill(7)], name, { type });
}

export function domError(name: string) {
  return new DOMException(name, name);
}
