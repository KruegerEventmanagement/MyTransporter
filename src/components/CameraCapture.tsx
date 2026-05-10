import { useEffect, useRef, useState } from "react";
import { X, Camera as CameraIcon, RefreshCw } from "lucide-react";

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
  | "damage";

interface CameraCaptureProps {
  open: boolean;
  title: string;
  hint?: string;
  variant: SilhouetteVariant;
  onClose: () => void;
  onCapture: (file: File) => void;
}

function Silhouette({ variant }: { variant: SilhouetteVariant }) {
  // Stroke-only outlines, white with soft glow, centered in viewBox 400x300
  const common = {
    fill: "none",
    stroke: "white",
    strokeWidth: 2.5,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };

  switch (variant) {
    case "front":
    case "back":
      // Boxy van seen straight on
      return (
        <g {...common}>
          {/* Outer body */}
          <path d="M110 70 Q110 60 120 60 H280 Q290 60 290 70 V230 Q290 240 280 240 H120 Q110 240 110 230 Z" />
          {/* Roof line */}
          <path d="M125 60 V52 Q125 48 130 48 H270 Q275 48 275 52 V60" />
          {/* Windshield */}
          <path d="M130 75 H270 V120 H130 Z" />
          {/* Headlights */}
          <rect x="125" y="135" width="35" height="22" rx="3" />
          <rect x="240" y="135" width="35" height="22" rx="3" />
          {/* Grille */}
          <path d="M170 145 H230 M170 155 H230" />
          {/* Bumper */}
          <path d="M115 200 H285" />
          {/* Plate */}
          <rect x="170" y="210" width="60" height="18" rx="2" />
        </g>
      );
    case "side-left":
    case "side-right": {
      const flip = variant === "side-left";
      return (
        <g {...common} transform={flip ? "translate(400 0) scale(-1 1)" : undefined}>
          {/* Body profile */}
          <path d="M40 200 V120 Q40 110 50 110 H110 L140 70 H300 Q320 70 320 90 V200 Z" />
          {/* Cabin window */}
          <path d="M150 80 H190 V108 H145 Z" />
          {/* Cargo windows hint (dashed) */}
          <path d="M200 90 H300 V108 H200 Z" strokeDasharray="6 4" />
          {/* Wheels */}
          <circle cx="95" cy="210" r="22" />
          <circle cx="270" cy="210" r="22" />
          <circle cx="95" cy="210" r="8" />
          <circle cx="270" cy="210" r="8" />
          {/* Door split */}
          <path d="M195 110 V200" strokeDasharray="4 4" />
        </g>
      );
    }
    case "three-quarter-front-right":
    case "three-quarter-back-right":
    case "three-quarter-front-left":
    case "three-quarter-back-left": {
      const flipX =
        variant === "three-quarter-front-left" || variant === "three-quarter-back-left";
      return (
        <g {...common} transform={flipX ? "translate(400 0) scale(-1 1)" : undefined}>
          {/* Side panel */}
          <path d="M50 200 V130 Q50 122 58 122 H110 L135 80 H230 Q245 80 245 95 V200 Z" />
          {/* Front face (perspective) */}
          <path d="M245 95 L320 120 V210 L245 200 Z" />
          <path d="M245 200 L320 210" />
          {/* Windshield perspective */}
          <path d="M252 100 L312 122 V152 L252 138 Z" />
          {/* Side window */}
          <path d="M145 90 H180 V112 H140 Z" />
          {/* Cargo window hint */}
          <path d="M188 92 H238 V112 H188 Z" strokeDasharray="6 4" />
          {/* Wheels */}
          <circle cx="100" cy="210" r="20" />
          <circle cx="220" cy="210" r="20" />
          <circle cx="298" cy="218" r="14" />
          {/* Headlight on front face */}
          <path d="M260 165 L300 178 V190 L260 182 Z" />
        </g>
      );
    }
    case "interior":
      return (
        <g {...common} strokeDasharray="6 5">
          {/* Dashboard arc */}
          <path d="M40 230 Q200 130 360 230" />
          {/* Steering wheel hint */}
          <circle cx="130" cy="200" r="38" />
          <circle cx="130" cy="200" r="8" fill="white" />
          {/* Windshield top */}
          <path d="M40 90 Q200 60 360 90" />
          {/* Center console */}
          <path d="M180 230 H220 V270 H180 Z" />
        </g>
      );
    case "damage":
    default:
      return (
        <g {...common}>
          {/* Targeting reticle */}
          <circle cx="200" cy="150" r="80" strokeDasharray="4 6" />
          <path d="M200 50 V100 M200 200 V250 M100 150 H150 M250 150 H300" />
          <circle cx="200" cy="150" r="4" fill="white" />
        </g>
      );
  }
}

export function CameraCapture({ open, title, hint, variant, onClose, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setReady(false);

    const start = async () => {
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
        setError("Kamera konnte nicht geöffnet werden. Bitte Berechtigungen prüfen.");
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
    ctx.drawImage(video, 0, 0, w, h);
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

        {/* Blurred outer mask + clear focus area in the middle */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Darken edges with radial gradient */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at center, transparent 0%, transparent 55%, rgba(0,0,0,0.55) 100%)",
              backdropFilter: "blur(0px)",
            }}
          />
        </div>

        {/* Silhouette overlay */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
          <svg
            viewBox="0 0 400 300"
            className="w-[88%] max-w-[520px] opacity-80"
            style={{ filter: "drop-shadow(0 0 6px rgba(0,0,0,0.6))" }}
            preserveAspectRatio="xMidYMid meet"
          >
            <Silhouette variant={variant} />
          </svg>
        </div>

        {/* Helper line */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/50 text-white text-[11px] backdrop-blur-sm">
          Fahrzeug in der Vorlage ausrichten
        </div>

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