import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, X, RotateCcw, CheckCircle, AlertTriangle, Zap, ZapOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTapFocus } from "@/hooks/useTapFocus";

type ScanSide = "front" | "back";
type ScanPhase =
  | "idle"
  | "camera"
  | "capturing"
  | "preview"
  | "verified"
  | "error"
  | "rejected";

interface DocumentScannerProps {
  documentType: "license" | "id";
  onComplete: () => void;
  isComplete: boolean;
  onReset?: () => void | Promise<void>;
}

const DOC_LABELS = {
  license: { name: "Führerschein", icon: "🪪" },
  id: { name: "Personalausweis", icon: "🪪" },
};

export function DocumentScanner({ documentType, onComplete, isComplete, onReset }: DocumentScannerProps) {
  const [phase, setPhase] = useState<ScanPhase>(isComplete ? "verified" : "idle");
  const [side, setSide] = useState<ScanSide>("front");
  const [frontDone, setFrontDone] = useState(false);
  const [rejectMsg, setRejectMsg] = useState<string>("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const pendingBlobRef = useRef<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { focusPoint, handleTap } = useTapFocus(videoRef, streamRef);

  const label = DOC_LABELS[documentType];

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  const startCamera = useCallback(async () => {
    setPhase("camera");
    setRejectMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // Autofokus + Torch-Erkennung (best effort)
      const track = stream.getVideoTracks()[0];
      try {
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean };
        const advanced: MediaTrackConstraintSet[] = [];
        if (caps.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
        if (advanced.length) await track.applyConstraints({ advanced });
        if (caps.torch) setTorchAvailable(true);
      } catch {
        /* ignore */
      }
    } catch {
      setPhase("error");
    }
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const runCapture = useCallback(async () => {
    setPhase("capturing");
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) {
        throw new Error("Kamera nicht bereit");
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas-Kontext fehlt");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9));
      if (!blob) throw new Error("Bild konnte nicht erstellt werden");
      pendingBlobRef.current = blob;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setPhase("preview");
    } catch (err) {
      console.error("Document capture error:", err);
      setRejectMsg(err instanceof Error ? err.message : "Unbekannter Fehler.");
      setPhase("rejected");
    }
  }, [previewUrl]);

  const confirmUpload = useCallback(async () => {
    const blob = pendingBlobRef.current;
    if (!blob) return;
    setPhase("capturing");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");
      const docTypeKey = `${documentType}_${side}`;
      const path = `${user.id}/${docTypeKey}_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("user-documents")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      await supabase.from("user_documents").insert({
        user_id: user.id,
        doc_type: docTypeKey,
        photo_url: path,
        ai_verified: true,
        verified_at: new Date().toISOString(),
      });

      pendingBlobRef.current = null;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      stopCamera();

      if (!frontDone) {
        setFrontDone(true);
        setSide("back");
        setPhase("idle");
      } else {
        setPhase("verified");
        onComplete();
      }
    } catch (err) {
      console.error("Document upload error:", err);
      setRejectMsg(err instanceof Error ? err.message : "Unbekannter Fehler.");
      setPhase("rejected");
    }
  }, [documentType, side, frontDone, onComplete, stopCamera, previewUrl]);

  const retakeFromPreview = useCallback(() => {
    pendingBlobRef.current = null;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPhase("camera");
  }, [previewUrl]);

  const handleClose = () => {
    stopCamera();
    pendingBlobRef.current = null;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPhase(isComplete ? "verified" : "idle");
    setRejectMsg("");
  };

  const retryFromRejected = () => {
    setRejectMsg("");
    const hasLiveStream = !!streamRef.current?.getVideoTracks().some((track) => track.readyState === "live");
    if (hasLiveStream) {
      setPhase("camera");
    } else {
      stopCamera();
      void startCamera();
    }
  };

  // Reattach an existing MediaStream to the <video> whenever we (re)enter
  // the camera phase. Without this, retry after a rejection remounts the
  // <video> element but never re-binds srcObject, leaving a black preview.
  useEffect(() => {
    if (phase !== "camera") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    video.play().catch(() => {
      /* ignore autoplay errors */
    });
  }, [phase]);

  // Idle state, button
  if (phase === "idle" || phase === "verified") {
    return (
      <div className="space-y-2">
        <button
          onClick={() => {
            if (phase !== "verified") startCamera();
          }}
          disabled={phase === "verified"}
          className={`w-full p-4 rounded-2xl border flex items-center gap-4 transition-all ${
            phase === "verified"
              ? "border-border bg-secondary"
              : "border-border bg-card hover:border-accent/50 hover:shadow-sm"
          }`}
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            phase === "verified" ? "bg-muted" : "bg-accent/10"
          }`}>
            {phase === "verified" ? (
              <CheckCircle className="w-5 h-5 text-foreground" />
            ) : (
              <Camera className="w-5 h-5 text-accent" />
            )}
          </div>
          <div className="flex-1 text-left">
            <p className="font-medium text-foreground">{label.name} scannen</p>
            <p className="text-sm text-muted-foreground">
              {phase === "verified"
                ? "✓ Vorder- & Rückseite gespeichert"
                : frontDone
                  ? "Rückseite noch ausstehend"
                  : "Vorder- und Rückseite fotografieren"}
            </p>
          </div>
          {phase !== "verified" && (
            <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-accent text-accent-foreground">
              {frontDone ? "Weiter" : "Scannen"}
            </span>
          )}
        </button>
        {phase === "verified" && onReset && (
          <button
            onClick={async () => {
              await onReset();
              setFrontDone(false);
              setSide("front");
              setPhase("idle");
            }}
            className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 py-1"
          >
            Erneut aufnehmen
          </button>
        )}
      </div>
    );
  }

  // Fullscreen camera / scanning / verifying overlay
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
        <button onClick={handleClose} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
          <X className="w-5 h-5 text-white" />
        </button>
        <div className="text-center">
          <p className="text-white font-medium text-sm">{label.name}</p>
          <p className="text-white/70 text-xs">{side === "front" ? "Vorderseite" : "Rückseite"}</p>
        </div>
        {torchAvailable ? (
          <button onClick={toggleTorch} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            {torchOn ? <ZapOff className="w-5 h-5 text-white" /> : <Zap className="w-5 h-5 text-white" />}
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Camera view */}
      {(phase === "camera" || phase === "capturing") && (
        <>
          <video
            ref={videoRef}
            className="flex-1 object-cover"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Card overlay guide */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* Darkened corners */}
            <div className="relative w-[85%] max-w-[360px] aspect-[1.586/1]">
              {/* Card border */}
              <div className="absolute inset-0 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
              
              {/* Corner marks */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-2xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-2xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-2xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-2xl" />
            </div>
          </div>

          {/* Instructions */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pb-10">
            <p className="text-white text-center text-lg font-medium mb-2">
              {phase === "capturing"
                ? "Bild wird aufgenommen..."
                : `Bitte ${side === "front" ? "Vorderseite" : "Rückseite"} des ${label.name}s in den Rahmen halten`}
            </p>
            <p className="text-white/60 text-center text-sm mb-6">
              Positionieren, dann Auslöser drücken
            </p>

            {phase === "camera" && (
              <div className="flex justify-center">
                <button
                  onClick={runCapture}
                  className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                >
                  <div className="w-14 h-14 rounded-full border-4 border-black/10" />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Uploading state */}
      {phase === "capturing" && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center px-8">
          <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center mb-6">
            <Loader2 className="w-10 h-10 text-accent animate-spin" />
          </div>
          <h3 className="text-white text-xl font-bold mb-2">Foto wird gespeichert</h3>
          <p className="text-white/60 text-center text-sm">
            {side === "front" ? "Vorderseite" : "Rückseite"} wird hochgeladen.
          </p>
        </div>
      )}

      {/* Preview state — user must confirm or retake */}
      {phase === "preview" && previewUrl && (
        <div className="absolute inset-0 bg-black flex flex-col">
          <div className="flex-1 flex items-center justify-center p-4">
            <img
              src={previewUrl}
              alt="Aufgenommenes Dokument"
              className="max-w-full max-h-full object-contain rounded-2xl"
            />
          </div>
          <div className="p-6 pb-10 bg-gradient-to-t from-black/90 to-transparent">
            <p className="text-white text-center text-base font-medium mb-4">
              Sieht das Bild gut aus?
            </p>
            <div className="flex gap-3">
              <button
                onClick={retakeFromPreview}
                className="flex-1 px-4 py-3 rounded-full bg-white/15 text-white font-medium flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Erneut
              </button>
              <button
                onClick={confirmUpload}
                className="flex-1 px-4 py-3 rounded-full bg-accent text-accent-foreground font-medium flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Übernehmen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejected state */}
      {phase === "rejected" && (
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
          <h3 className="text-white text-xl font-bold mb-2">Bitte erneut scannen</h3>
          <p className="text-white/70 text-center text-sm mb-8 max-w-sm">{rejectMsg}</p>
          <div className="flex gap-3">
            <button onClick={handleClose} className="px-6 py-3 rounded-full bg-white/10 text-white font-medium">
              Abbrechen
            </button>
            <button
              onClick={retryFromRejected}
              className="px-6 py-3 rounded-full bg-accent text-accent-foreground font-medium flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Erneut versuchen
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {phase === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
          <h3 className="text-white text-xl font-bold mb-2">Kamera nicht verfügbar</h3>
          <p className="text-white/60 text-center text-sm mb-8">
            Bitte erlaube den Kamerazugriff oder verwende ein Gerät mit Kamera.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-6 py-3 rounded-full bg-white/10 text-white font-medium"
            >
              Abbrechen
            </button>
            <button
              onClick={startCamera}
              className="px-6 py-3 rounded-full bg-accent text-accent-foreground font-medium flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Erneut versuchen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}