import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Camera as CameraIcon, RefreshCw, Image as ImageIcon, Loader2 } from "lucide-react";
import { useTapFocus } from "@/hooks/useTapFocus";
import {
  blobToJpegFile,
  canvasToJpegBlob,
  classifyCameraError,
  getUserMediaWithTimeout,
  normalizeImageFile,
  stopStream,
  waitForVideoFrame,
  type CameraErrorKind,
} from "@/lib/image-capture";
import silhouetteFront from "@/assets/silhouette-front.png";
import silhouetteBack from "@/assets/silhouette-back.png";
import silhouetteSide from "@/assets/silhouette-side.png";
import silhouetteTqFront from "@/assets/silhouette-tq-front.png";
import silhouetteTqBack from "@/assets/silhouette-tq-back.png";
import silhouetteInterior from "@/assets/silhouette-interior.png";

export type SilhouetteVariant =
  | "front"
  | "back"
  | "side-left"
  | "side-right"
  | "three-quarter-front-right"
  | "three-quarter-back-right"
  | "three-quarter-back-left"
  | "three-quarter-front-left"
  | "interior"
  | "damage"
  | "receipt";

interface CameraCaptureProps {
  open: boolean;
  title: string;
  hint?: string;
  variant: SilhouetteVariant;
  onClose: () => void;
  onCapture: (file: File) => void | Promise<void>;
  /** Wenn true, wird das Foto wie ein Scanner verarbeitet (S/W, hoher Kontrast). */
  scanMode?: boolean;
  /** Zeitlimits (nur für Tests überschreibbar). */
  cameraTimeoutMs?: number;
  frameTimeoutMs?: number;
}

function getOverlay(variant: SilhouetteVariant): { src: string; flip: boolean } | null {
  switch (variant) {
    case "front":
      return { src: silhouetteFront, flip: false };
    case "back":
      return { src: silhouetteBack, flip: false };
    case "side-right":
      return { src: silhouetteSide, flip: false };
    case "side-left":
      return { src: silhouetteSide, flip: true };
    case "three-quarter-front-right":
      return { src: silhouetteTqFront, flip: false };
    case "three-quarter-front-left":
      return { src: silhouetteTqFront, flip: true };
    case "three-quarter-back-right":
      return { src: silhouetteTqBack, flip: true };
    case "three-quarter-back-left":
      return { src: silhouetteTqBack, flip: false };
    case "interior":
      return { src: silhouetteInterior, flip: false };
    case "damage":
    default:
      return null;
  }
}

const CAMERA_ERROR_TEXT: Record<CameraErrorKind, string> = {
  denied:
    "Kamerazugriff nicht erlaubt. Erlaube die Kamera in den Browser-Einstellungen oder nimm das Foto mit der Geräte-Kamera auf.",
  notfound:
    "Keine Kamera gefunden. Nimm das Foto mit der Geräte-Kamera auf oder wähle ein vorhandenes Foto.",
  busy: "Die Kamera wird gerade von einer anderen App verwendet. Schließe sie und versuche es erneut – oder nimm das Foto direkt auf.",
  timeout:
    "Die Live-Kamera startet nicht. Versuche es erneut oder nimm das Foto mit der Geräte-Kamera auf.",
  unsupported: "Live-Kamera nicht verfügbar. Bitte nimm das Foto mit der Geräte-Kamera auf.",
};

type Status = "starting" | "live" | "error";

export function CameraCapture({
  open,
  title,
  hint,
  variant,
  onClose,
  onCapture,
  scanMode = false,
  cameraTimeoutMs = 12000,
  frameTimeoutMs = 6000,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<Status>("starting");
  const [cameraError, setCameraError] = useState<CameraErrorKind | null>(null);
  const [shotError, setShotError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const { focusPoint, handleTap } = useTapFocus(videoRef, streamRef);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus("starting");
    setCameraError(null);
    setShotError(null);

    const fail = (kind: CameraErrorKind) => {
      if (cancelled) return;
      stopStream(streamRef.current);
      streamRef.current = null;
      setCameraError(kind);
      setStatus("error");
    };

    (async () => {
      const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
      if (
        !md?.getUserMedia ||
        (typeof window !== "undefined" && window.isSecureContext === false)
      ) {
        fail("unsupported");
        return;
      }
      let stream: MediaStream;
      try {
        stream = await getUserMediaWithTimeout(
          md,
          {
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          },
          cameraTimeoutMs,
          () => cancelled,
        );
      } catch (err) {
        if (!cancelled) console.warn("Camera error:", (err as { name?: string })?.name);
        fail(classifyCameraError(err));
        return;
      }
      if (cancelled) {
        stopStream(stream);
        return;
      }
      streamRef.current = stream;
      let video = videoRef.current;
      for (let i = 0; !video && i < 60 && !cancelled; i += 1) {
        await new Promise((r) => setTimeout(r, 16));
        video = videoRef.current;
      }
      if (cancelled) {
        stopStream(stream);
        return;
      }
      if (!video) {
        fail("unsupported");
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // iOS kann play() ablehnen; entscheidend ist, ob danach ein Bild kommt.
      }
      try {
        await waitForVideoFrame(video, frameTimeoutMs);
      } catch {
        fail("timeout");
        return;
      }
      if (!cancelled) setStatus("live");
    })();

    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open, facingMode, attempt, cameraTimeoutMs, frameTimeoutMs]);

  const deliver = useCallback(
    async (file: File) => {
      await onCapture(file);
    },
    [onCapture],
  );

  const handleShoot = async () => {
    if (busyRef.current) return;
    const video = videoRef.current;
    if (status !== "live" || !video || !video.videoWidth || !video.videoHeight) {
      setShotError(
        "Die Kamera ist noch nicht bereit. Bitte kurz warten oder Foto mit der Geräte-Kamera aufnehmen.",
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setShotError(null);
    try {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Foto konnte nicht erstellt werden. Bitte erneut versuchen.");
      if (scanMode) {
        ctx.filter = "grayscale(1) contrast(1.6) brightness(1.15)";
        ctx.drawImage(video, 0, 0, w, h);
        try {
          const img = ctx.getImageData(0, 0, w, h);
          const d = img.data;
          for (let i = 0; i < d.length; i += 4) {
            const v = d[i];
            const adj = v < 110 ? Math.max(0, v - 20) : Math.min(255, v + 25);
            d[i] = d[i + 1] = d[i + 2] = adj;
          }
          ctx.putImageData(img, 0, 0);
        } catch {
          // Filter ist optional
        }
      } else {
        ctx.drawImage(video, 0, 0, w, h);
      }
      const blob = await canvasToJpegBlob(canvas, { quality: 0.92 });
      await deliver(blobToJpegFile(blob, "capture"));
    } catch (err) {
      if (mountedRef.current) {
        setShotError(
          err instanceof Error
            ? err.message
            : "Foto konnte nicht erstellt werden. Bitte erneut versuchen.",
        );
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setShotError(null);
    try {
      const blob = await normalizeImageFile(file);
      await deliver(blobToJpegFile(blob, "photo"));
    } catch (err) {
      if (mountedRef.current) {
        setShotError(err instanceof Error ? err.message : "Foto konnte nicht gelesen werden.");
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  if (!open || typeof document === "undefined") return null;

  const overlay = getOverlay(variant);

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-x-0 top-0 z-50 h-[100dvh] max-h-[100dvh] overflow-hidden bg-black flex flex-col"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="camera-file-input"
        onChange={handleFile}
      />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
          aria-label="Schließen"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-medium">{title}</p>
          {hint && <p className="text-[11px] opacity-70">{hint}</p>}
        </div>
        {status === "live" ? (
          <button
            onClick={() => setFacingMode((f) => (f === "environment" ? "user" : "environment"))}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
            aria-label="Kamera wechseln"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Camera viewport */}
      <div className="relative flex-1 min-h-0 overflow-hidden bg-black">
        <video
          ref={videoRef}
          onPointerDown={handleTap}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-cover ${status === "live" ? "" : "opacity-0"}`}
        />

        {status === "live" && focusPoint && (
          <div
            className="absolute pointer-events-none w-16 h-16 -ml-8 -mt-8 border-2 border-white rounded-md transition-opacity duration-200"
            style={{
              left: `${focusPoint.x}%`,
              top: `${focusPoint.y}%`,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.25)",
            }}
          />
        )}

        {status === "live" &&
          (overlay ? (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
              <img
                src={overlay.src}
                alt=""
                className="w-[92%] max-w-[640px] h-auto opacity-40"
                style={{
                  filter: "invert(1) drop-shadow(0 0 8px rgba(0,0,0,0.8))",
                  transform: overlay.flip ? "scaleX(-1)" : undefined,
                }}
              />
            </div>
          ) : variant === "receipt" ? (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
              <div className="w-[78%] max-w-[420px] aspect-[3/4] border-2 border-white/80 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
          ) : null)}

        {status === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white p-6 text-center">
            <Loader2 className="w-8 h-8 animate-spin opacity-80" />
            <p className="text-sm opacity-80">Kamera wird gestartet …</p>
          </div>
        )}

        {status === "error" && cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-6 text-white text-center">
            <CameraIcon className="w-14 h-14 opacity-70" />
            <p className="text-sm opacity-90 max-w-sm" role="alert">
              {CAMERA_ERROR_TEXT[cameraError]}
            </p>
            {cameraError !== "unsupported" && (
              <button
                onClick={() => setAttempt((a) => a + 1)}
                className="rounded-full bg-white/15 px-6 py-3 text-sm font-medium flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Live-Kamera erneut versuchen
              </button>
            )}
          </div>
        )}

        {shotError && (
          <div
            role="alert"
            className="absolute inset-x-4 bottom-4 p-3 rounded-2xl bg-black/85 text-white text-sm text-center"
          >
            {shotError}
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 text-white">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Foto wird gespeichert …</p>
          </div>
        )}
      </div>

      {/* Footer: Auslöser + jederzeit erreichbarer nativer Foto-Weg */}
      <div className="bg-black flex flex-col items-center gap-3 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {status === "live" && (
          <button
            onClick={handleShoot}
            disabled={busy}
            aria-label="Foto aufnehmen"
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-50"
          >
            <span className="w-16 h-16 rounded-full bg-white flex items-center justify-center">
              <CameraIcon className="w-7 h-7 text-black" />
            </span>
          </button>
        )}
        <button
          onClick={openFilePicker}
          disabled={busy}
          className={
            status === "live"
              ? "text-xs text-white/80 underline underline-offset-2 flex items-center gap-1.5 disabled:opacity-50"
              : "rounded-full bg-white text-black px-8 py-3 font-medium flex items-center gap-2 disabled:opacity-50"
          }
        >
          <ImageIcon className="w-4 h-4" /> Foto mit Geräte-Kamera / aus Galerie
        </button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
