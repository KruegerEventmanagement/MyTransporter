/**
 * Gemeinsame, browserseitige Helfer für Kamera- und Fotoaufnahmen.
 * Ziel: niemals stumm scheitern (null-Blob, 0-Pixel-Bild, hängende Promise).
 * Jeder Fehler wird als CaptureError mit verständlicher deutscher Meldung geworfen.
 */

export class CaptureError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "canvas_empty"
      | "encode_failed"
      | "not_image"
      | "too_large"
      | "decode_failed"
      | "video_timeout"
      | "camera_timeout",
  ) {
    super(message);
    this.name = "CaptureError";
  }
}

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const IMAGE_EXT = /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/i;

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, encoded] = dataUrl.split(",");
  const mime = header?.match(/^data:(.*?);base64$/)?.[1];
  if (!mime || !mime.startsWith("image/") || !encoded) {
    throw new CaptureError(
      "Bild konnte nicht erstellt werden. Bitte erneut versuchen.",
      "encode_failed",
    );
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  if (bytes.length === 0) {
    throw new CaptureError(
      "Bild konnte nicht erstellt werden. Bitte erneut versuchen.",
      "encode_failed",
    );
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Canvas → JPEG-Blob. toBlob mit begrenzter Wartezeit (manche iOS-Versionen
 * rufen den Callback nie auf), danach toDataURL-Fallback. Ergebnis ist immer
 * ein nicht-leeres image/jpeg, sonst CaptureError.
 */
export async function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  { quality = 0.9, timeoutMs = 1500 }: { quality?: number; timeoutMs?: number } = {},
): Promise<Blob> {
  if (!canvas.width || !canvas.height) {
    throw new CaptureError("Das Kamerabild ist leer. Bitte erneut aufnehmen.", "canvas_empty");
  }
  if (typeof canvas.toBlob === "function") {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const blob = await Promise.race<Blob | null>([
        new Promise<Blob | null>((resolve) => {
          try {
            canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
          } catch {
            resolve(null);
          }
        }),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        }),
      ]);
      if (blob && blob.size > 0 && blob.type === "image/jpeg") return blob;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  } catch {
    throw new CaptureError(
      "Bild konnte nicht erstellt werden. Bitte erneut versuchen.",
      "encode_failed",
    );
  }
  // Browser ohne JPEG-Encoder liefern PNG oder "data:," – kein falscher .jpg-Inhalt.
  if (!dataUrl.startsWith("data:image/jpeg")) {
    throw new CaptureError(
      "Bild konnte nicht erstellt werden. Bitte erneut versuchen.",
      "encode_failed",
    );
  }
  return dataUrlToBlob(dataUrl);
}

/** Wartet, bis das Video echte Bilddimensionen hat. */
export function waitForVideoFrame(video: HTMLVideoElement, timeoutMs = 6000): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const events = ["loadedmetadata", "loadeddata", "resize", "playing", "canplay"];
    const check = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        cleanup();
        resolve();
      }
    };
    const poll = setInterval(check, 200);
    const timer = setTimeout(() => {
      cleanup();
      reject(new CaptureError("Die Kamera liefert kein Bild.", "video_timeout"));
    }, timeoutMs);
    function cleanup() {
      clearInterval(poll);
      clearTimeout(timer);
      events.forEach((e) => video.removeEventListener(e, check));
    }
    events.forEach((e) => video.addEventListener(e, check));
  });
}

/**
 * getUserMedia mit Zeitlimit. Löst sich der Stream erst nach dem Timeout
 * (oder nach Abbruch), werden seine Spuren sofort gestoppt.
 */
export function getUserMediaWithTimeout(
  md: MediaDevices,
  constraints: MediaStreamConstraints,
  timeoutMs: number,
  isCancelled: () => boolean = () => false,
): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new CaptureError("Die Kamerafreigabe dauert zu lange.", "camera_timeout"));
    }, timeoutMs);
    md.getUserMedia(constraints).then(
      (stream) => {
        if (settled || isCancelled()) {
          stopStream(stream);
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(new DOMException("Abgebrochen", "AbortError"));
          }
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(stream);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  });
}

export type CameraErrorKind = "denied" | "notfound" | "busy" | "timeout" | "unsupported";

export function classifyCameraError(err: unknown): CameraErrorKind {
  if (err instanceof CaptureError) return "timeout";
  const name = (err as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "notfound";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "unsupported";
}

const HEIC_EXT = /\.(heic|heif)$/i;

export function isHeicFile(file: File): boolean {
  return /^image\/hei[cf](-sequence)?$/i.test(file.type) || HEIC_EXT.test(file.name);
}

/** Dateiendung zum gespeicherten MIME-Typ (Standard: jpg). */
export function imageExtension(mime: string): string {
  if (/hei[cf]/i.test(mime)) return mime.toLowerCase().includes("heif") ? "heif" : "heic";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export function isLikelyImageFile(file: File): boolean {
  if (file.type) return file.type.startsWith("image/");
  return IMAGE_EXT.test(file.name);
}

/**
 * Datei aus Galerie/Systemkamera → validiertes, verkleinertes JPEG.
 * Wirft CaptureError bei Nicht-Bild, Übergröße, Dekodier- oder Kodierfehler.
 */
export async function normalizeImageFile(
  file: File,
  {
    maxDimension = 2000,
    decodeTimeoutMs = 15000,
  }: { maxDimension?: number; decodeTimeoutMs?: number } = {},
): Promise<Blob> {
  if (!isLikelyImageFile(file)) {
    throw new CaptureError("Bitte ein Foto (Bild-Datei) auswählen.", "not_image");
  }
  if (file.size === 0) {
    throw new CaptureError("Das Foto ist leer. Bitte ein anderes Foto wählen.", "decode_failed");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new CaptureError("Das Foto ist zu groß (max. 30 MB).", "too_large");
  }
  try {
    return await decodeToJpeg(file, maxDimension, decodeTimeoutMs);
  } catch (err) {
    // HEIC/HEIF kann z. B. Android Chrome nicht dekodieren: Original unverändert übernehmen
    // statt das Foto grundlos abzulehnen (iOS Safari liefert meist schon JPEG).
    if (isHeicFile(file) && err instanceof CaptureError && err.code === "decode_failed") {
      const mime = /heif/i.test(file.type) || /\.heif$/i.test(file.name) ? "image/heif" : "image/heic";
      return new Blob([await file.arrayBuffer()], { type: mime });
    }
    throw err;
  }
}

async function decodeToJpeg(file: File, maxDimension: number, decodeTimeoutMs: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        img.onload = img.onerror = null;
        reject(new CaptureError("Foto konnte nicht gelesen werden.", "decode_failed"));
      }, decodeTimeoutMs);
      img.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new CaptureError("Foto konnte nicht gelesen werden.", "decode_failed"));
      };
      img.src = url;
    });
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new CaptureError("Foto konnte nicht gelesen werden.", "decode_failed");
    }
    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new CaptureError("Foto konnte nicht verarbeitet werden.", "encode_failed");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await canvasToJpegBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToJpegFile(blob: Blob, baseName: string): File {
  return new File([blob], `${baseName}_${Date.now()}.jpg`, { type: "image/jpeg" });
}

/** Wie blobToJpegFile, behält aber unverändert durchgereichte HEIC/HEIF-Originale korrekt typisiert. */
export function blobToImageFile(blob: Blob, baseName: string): File {
  if (/hei[cf]/i.test(blob.type)) {
    return new File([blob], `${baseName}_${Date.now()}.${imageExtension(blob.type)}`, { type: blob.type });
  }
  return blobToJpegFile(blob, baseName);
}
