import { useEffect, useRef, useState } from "react";
import { X, Camera as CameraIcon, RefreshCw } from "lucide-react";
import { useTapFocus } from "@/hooks/useTapFocus";
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
  onCapture: (file: File) => void;
  /** Wenn true, wird das Foto wie ein Scanner verarbeitet (S/W, hoher Kontrast). */
  scanMode?: boolean;
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

export function CameraCapture({ open, title, hint, variant, onClose, onCapture, scanMode = false }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [fileMode, setFileMode] = useState(false);
  const { focusPoint, handleTap } = useTapFocus(videoRef, streamRef);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setReady(false);

    const start = async () => {
      // Wenn Browser keine Mediendevices unterstützt (z. B. älteres iOS,
      // Webview ohne Kamera) direkt in den Datei-Upload-Modus wechseln.
      if (!navigator.mediaDevices?.getUserMedia) {
        setFileMode(true);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setReady(true);
        }
      } catch (err) {
        console.error("Camera error", err);
        // Fallback: nativen Datei-Upload mit Kamera-Capture anbieten
        setFileMode(true);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, facingMode]);

  const handleShoot = async () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (scanMode) {
      // CamScanner-Look: S/W, hoher Kontrast, leicht heller
      ctx.filter = "grayscale(1) contrast(1.6) brightness(1.15)";
      ctx.drawImage(video, 0, 0, w, h);
      // Zusätzlich: leichten Weißabgleich/Schwellwert anwenden
      try {
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          // bereits grau -> Kontrast-Push
          const v = d[i];
          const adj = v < 110 ? Math.max(0, v - 20) : Math.min(255, v + 25);
          d[i] = d[i + 1] = d[i + 2] = adj;
        }
        ctx.putImageData(img, 0, 0);
      } catch {
        // ignore
      }
    } else {
      ctx.drawImage(video, 0, 0, w, h);
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
      },
      "image/jpeg",
      0.92
    );
  };

  if (!open) return null;

  if (fileMode) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 text-white">
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
          <div className="w-10" />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-white text-center gap-6">
          <CameraIcon className="w-16 h-16 opacity-70" />
          <div>
            <p className="text-base font-medium mb-1">Live-Kamera nicht verfügbar</p>
            <p className="text-sm opacity-70">Bitte nimm jetzt ein Foto mit deiner Geräte-Kamera auf.</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onCapture(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full bg-white text-black px-8 py-3 font-medium"
          >
            Foto aufnehmen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
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
        <button
          onClick={() => setFacingMode((f) => (f === "environment" ? "user" : "environment"))}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
          aria-label="Kamera wechseln"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Camera viewport */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Silhouette overlay (Carmera-Stil) */}
        {(() => {
          const overlay = getOverlay(variant);
          if (!overlay) {
            // Beleg-Modus: Dokumenten-Rahmen
            if (variant === "receipt") {
              return (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                  <div className="w-[78%] max-w-[420px] aspect-[3/4] border-2 border-white/80 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                </div>
              );
            }
            return null;
          }
          return (
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
          );
        })()}

        {error && (
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 p-4 rounded-2xl bg-black/80 text-white text-sm text-center">
            {error}
          </div>
        )}
      </div>

      {/* Shutter */}
      <div className="bg-black flex items-center justify-center py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          onClick={handleShoot}
          disabled={!ready}
          aria-label="Foto aufnehmen"
          className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-50"
        >
          <span className="w-16 h-16 rounded-full bg-white flex items-center justify-center">
            <CameraIcon className="w-7 h-7 text-black" />
          </span>
        </button>
      </div>
    </div>
  );
}